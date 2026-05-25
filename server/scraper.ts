/**
 * Job scraper + AI analysis engine
 *
 * Strategy: scrape as many jobs as possible from all categories × all portals,
 * then AI-analyse every single one, sort by score, and save only the top N.
 *
 * Scoring factors:
 *   1. Distance from user location → closer = higher score
 *   2. CV match → AI analyses each uploaded CV vs job
 *   3. Work mode preference (hybrid/remote/onsite)
 *   4. Category relevance
 *
 * Supported portals:  jobs.cz (HTML)  |  startupjobs.cz (JSON API)  |  prace.cz (HTML)
 * AI model:           gpt-4.1-mini (OpenAI)
 */

import type OpenAIType from "openai";
import * as cheerio from "cheerio";
import { db } from "./storage.js";
import { jobListings, watcherConfigs, cvVersions } from "@shared/schema.js";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedJob {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salary?: string;
  url: string;
  portal: string;
}

export interface AiAnalysis {
  score: number;
  reason: string;
  pros: string[];
  cons: string[];
  suggestedCvHint: string;
  matchedCategories: string[];
  distanceKm?: number | null;       // estimated distance from user
  cvMatchScores?: Record<string, number>; // cvName → individual CV match (0-100)
  workModeMatch?: boolean;          // true if job matches preferred work mode
}

// ---------------------------------------------------------------------------
// Default search configuration
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORIES = [
  "ai",
  "automation",
  "social-media",
  "bank-tester",
  "junior-it",
  "data-analyst",
  "devops",
  "marketing",
] as const;

export type JobCategory = (typeof DEFAULT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<JobCategory, string> = {
  ai: "AI / Machine Learning",
  automation: "Automatizácia / RPA",
  "social-media": "Sociálne siete / Content",
  "bank-tester": "Tester v banke",
  "junior-it": "Junior IT pozícia",
  "data-analyst": "Dátový analytik",
  devops: "DevOps / Cloud",
  marketing: "Marketing / PPC",
};

const CATEGORY_SEARCH_TERMS: Record<JobCategory, string[]> = {
  ai: ["AI", "machine learning", "artificial intelligence", "LLM"],
  automation: ["automatizácia", "automation", "QA tester", "RPA"],
  "social-media": ["social media", "content manager", "community manager", "social media manager"],
  "bank-tester": ["tester banka", "QA banka", "tester finanční", "test analyst"],
  "junior-it": ["junior developer", "junior IT", "junior programátor", "trainee IT"],
  "data-analyst": ["data analyst", "dátový analytik", "business intelligence", "data engineer"],
  devops: ["devops", "cloud engineer", "SRE", "kubernetes"],
  marketing: ["marketing", "PPC specialist", "digital marketing", "SEO"],
};

// ---------------------------------------------------------------------------
// Common fetch helper
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function safeFetch(
  url: string,
  accept: string = "text/html",
): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: accept,
        "Accept-Language": "cs,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[scraper] HTTP ${res.status} for ${url}`);
      return null;
    }
    return res;
  } catch (err) {
    console.error(`[scraper] fetch error for ${url}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Image-based CV text extraction (OpenAI Vision)
// ---------------------------------------------------------------------------

async function extractTextFromImage(base64DataUrl: string): Promise<string> {
  try {
    const openai = await getOpenAI();
    // Ensure it has the data URL prefix
    const imageUrl = base64DataUrl.startsWith("data:")
      ? base64DataUrl
      : `data:image/png;base64,${base64DataUrl}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL text content from this CV/resume image. Return the raw text only, no formatting or commentary. Include all sections: personal info, skills, experience, education, etc.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    return (response.choices[0]?.message?.content || "").trim().slice(0, 4000);
  } catch (err) {
    console.error("[scraper] Image text extraction failed:", err);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Geocoding — resolve location string → { lat, lng }
// Uses free Nominatim API (OpenStreetMap)
// ONLY used for the user's watcher location (single call), NOT for job locations
// ---------------------------------------------------------------------------

interface GeoCoords { lat: number; lng: number }

const geocodeCache = new Map<string, GeoCoords | null>();

async function geocodeLocation(location: string): Promise<GeoCoords | null> {
  const key = location.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&countrycodes=cz,sk`;
      const res = await fetch(url, {
        headers: { "User-Agent": "JobHunter/1.0 (job search app)" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 429) {
        console.warn(`[scraper] Nominatim rate-limited (attempt ${attempt + 1}/3)`);
        continue;
      }
      if (!res.ok) continue;
      const data: { lat: string; lon: string }[] = await res.json();
      if (data.length === 0) { geocodeCache.set(key, null); return null; }
      const coords: GeoCoords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(key, coords);
      return coords;
    } catch {
      if (attempt < 2) continue;
    }
  }
  console.warn(`[scraper] Geocoding failed for "${location}" after 3 attempts`);
  geocodeCache.set(key, null);
  return null;
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(a: GeoCoords, b: GeoCoords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2Lat = Math.sin(dLat / 2) ** 2;
  const sin2Lng = Math.sin(dLng / 2) ** 2;
  const h = sin2Lat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin2Lng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Fast city-based distance estimation (NO Nominatim for job locations)
// Compares the user's search city with the job's location string
// ---------------------------------------------------------------------------

/** Approximate coordinates for major Czech/Slovak cities */
const CITY_COORDS: Record<string, GeoCoords> = {
  praha:    { lat: 50.0755, lng: 14.4378 },
  brno:     { lat: 49.1951, lng: 16.6068 },
  ostrava:  { lat: 49.8209, lng: 18.2625 },
  plzeň:    { lat: 49.7384, lng: 13.3736 },
  olomouc:  { lat: 49.5938, lng: 17.2509 },
  liberec:  { lat: 50.7671, lng: 15.0562 },
  pardubice:{ lat: 50.0343, lng: 15.7812 },
  zlín:     { lat: 49.2268, lng: 17.6673 },
  bratislava:{ lat: 48.1486, lng: 17.1077 },
  košice:   { lat: 48.7164, lng: 21.2611 },
};

/**
 * Estimate distance between user's city and a job location string.
 * Returns km or null if can't determine.
 * This is FAST — no API calls, pure string matching.
 */
function estimateDistanceKm(
  userCity: string,
  userCoords: GeoCoords | null,
  jobLocation: string,
): number | null {
  if (!jobLocation) return null;

  const userCityLower = userCity.toLowerCase().trim();
  const jobLower = jobLocation.toLowerCase().trim();

  // If job location contains the user's city → same city, estimate 5-10 km
  if (jobLower.includes(userCityLower) || userCityLower.includes(jobLower.split("–")[0].trim())) {
    return 5; // Same city
  }

  // Check known city names → extract the city from job location
  const jobCity = extractCityFromLocation(jobLocation).toLowerCase();

  if (jobCity === userCityLower) return 5; // Same city after extraction

  // If we have user coords and the job city has known coords → haversine
  if (userCoords && CITY_COORDS[jobCity]) {
    return Math.round(haversineKm(userCoords, CITY_COORDS[jobCity]));
  }

  // If both are known cities → haversine between known coords
  if (CITY_COORDS[userCityLower] && CITY_COORDS[jobCity]) {
    return Math.round(haversineKm(CITY_COORDS[userCityLower], CITY_COORDS[jobCity]));
  }

  // Check if job mentions "remote" / "home office" → distance doesn't matter
  if (jobLower.includes("remote") || jobLower.includes("home office")) return 0;

  // Can't determine
  return null;
}

/** Distance score modifier: 0-5 km = +10, 5-15 km = +5, 15-30 km = 0, 30+ km = -5 */
function distanceScoreModifier(km: number | null): number {
  if (km == null) return 0;
  if (km <= 5) return 10;
  if (km <= 15) return 5;
  if (km <= 30) return 0;
  return -5;
}

// ---------------------------------------------------------------------------
// Extract city name from a full address string
// "Hartigova 93, 130 00 Praha 3" → "Praha"
// "Brno" → "Brno"
// ---------------------------------------------------------------------------

const KNOWN_CITIES: Record<string, string> = {
  praha: "Praha",
  prague: "Praha",
  brno: "Brno",
  ostrava: "Ostrava",
  plzeň: "Plzeň",
  plzen: "Plzeň",
  olomouc: "Olomouc",
  liberec: "Liberec",
  "české budějovice": "České Budějovice",
  "ceske budejovice": "České Budějovice",
  "hradec králové": "Hradec Králové",
  "hradec kralove": "Hradec Králové",
  pardubice: "Pardubice",
  zlín: "Zlín",
  zlin: "Zlín",
  "ústí nad labem": "Ústí nad Labem",
  "usti nad labem": "Ústí nad Labem",
  "karlovy vary": "Karlovy Vary",
  jihlava: "Jihlava",
  kladno: "Kladno",
  teplice: "Teplice",
  opava: "Opava",
  děčín: "Děčín",
  decin: "Děčín",
  frýdek: "Frýdek-Místek",
  "frýdek-místek": "Frýdek-Místek",
  mladá: "Mladá Boleslav",
  "mladá boleslav": "Mladá Boleslav",
};

function extractCityFromLocation(location: string): string {
  if (!location) return "Praha";
  const lower = location.toLowerCase().trim();

  // Direct known city match?
  if (KNOWN_CITIES[lower]) return KNOWN_CITIES[lower];

  // Search for known city names within the location string
  for (const [key, city] of Object.entries(KNOWN_CITIES)) {
    if (lower.includes(key)) return city;
  }

  // If it has a comma, try the last significant part (city is often last)
  // e.g. "Hartigova 93, 130 00 Praha 3" → try "Praha 3" → strip trailing digits → "Praha"
  const parts = location.split(",").map(s => s.trim());
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    // Strip postal code prefix (e.g., "130 00 Praha 3" → "Praha 3")
    const withoutPostal = lastPart.replace(/^\d{3}\s?\d{2}\s*/, "").trim();
    // Strip trailing district number (e.g., "Praha 3" → "Praha")
    const withoutDistrict = withoutPostal.replace(/\s+\d+$/, "").trim();
    if (withoutDistrict) {
      // Check if it's a known city
      const lowerCity = withoutDistrict.toLowerCase();
      if (KNOWN_CITIES[lowerCity]) return KNOWN_CITIES[lowerCity];
      return withoutDistrict;
    }
  }

  // Fallback — return as-is
  return location.trim();
}

// ---------------------------------------------------------------------------
// jobs.cz – HTML scraping
// ---------------------------------------------------------------------------

async function scrapeJobsCz(
  query: string,
  location: string = "Praha",
  maxPages: number = 2,
): Promise<ScrapedJob[]> {
  const loc = location.toLowerCase().replace(/\s+/g, "-");
  const allJobs: ScrapedJob[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams();
    params.set("q[]", query);
    if (page > 1) params.set("page", String(page));

    const url = `https://www.jobs.cz/prace/${encodeURIComponent(loc)}/?${params.toString()}`;
    console.log(`[scraper] jobs.cz → ${url}`);

    const res = await safeFetch(url);
    if (!res) break;

    const html = await res.text();
    const $ = cheerio.load(html);

    let pageCount = 0;

    $("article.SearchResultCard").each((_i, el) => {
      const $el = $(el);

      const $titleLink = $el.find("a.SearchResultCard__titleLink");
      const title = $titleLink.text().trim();
      let jobUrl = $titleLink.attr("href") ?? "";
      if (jobUrl && !jobUrl.startsWith("http")) {
        jobUrl = `https://www.jobs.cz${jobUrl}`;
      }

      const jobAdId = $titleLink.attr("data-jobad-id") ?? `${Date.now()}-${_i}`;

      const company =
        $el.find(".SearchResultCard__footerItem span[translate='no']").first().text().trim() || "Neznáma firma";

      const locationText =
        $el.find("[data-test='serp-locality']").text().trim() || location;

      const salary =
        $el.find(".Tag--success").first().text().replace(/\u200D/g, "").replace(/\s+/g, " ").trim() || undefined;

      const dateText = $el.find(".SearchResultCard__status").first().text().trim();

      if (title) {
        allJobs.push({
          externalId: `jobscz-${jobAdId}`,
          title,
          company,
          location: locationText,
          description: dateText ? `Zverejnené: ${dateText}` : "",
          salary,
          url: jobUrl,
          portal: "jobs.cz",
        });
        pageCount++;
      }
    });

    // If this page had no results, don't fetch more pages
    if (pageCount === 0) break;
  }

  console.log(`[scraper] jobs.cz found ${allJobs.length} results for "${query}" (${maxPages} pages)`);
  return allJobs;
}

// ---------------------------------------------------------------------------
// startupjobs.cz – JSON API
// ---------------------------------------------------------------------------

async function scrapeStartupJobsCz(
  query: string,
  location: string = "Praha",
  maxPages: number = 2,
): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({ q: query, page: String(page) });
    const url = `https://www.startupjobs.cz/api/offers?${params.toString()}`;

    console.log(`[scraper] startupjobs.cz → ${url}`);

    const res = await safeFetch(url, "application/json, text/html");
    if (!res) break;

    let data: any;
    try {
      data = await res.json();
    } catch {
      console.error("[scraper] startupjobs.cz JSON parse error");
      break;
    }

    // The API returns { resultSet: [...], resultCount, ... }
    const offers: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.resultSet)
        ? data.resultSet
        : [];

    if (offers.length === 0) break;

    for (const j of offers) {
      const title: string = j.name ?? j.title ?? "";
      if (!title) continue;

      // Filter by location if user specified one
      const offerLocations: string = j.locations ?? j.city ?? "";
      if (
        location &&
        location.toLowerCase() !== "all" &&
        offerLocations &&
        !offerLocations.toLowerCase().includes(location.toLowerCase())
      ) {
        continue;
      }

      // Extract salary
      let salary: string | undefined;
      if (j.salary) {
        if (typeof j.salary === "string") {
          salary = j.salary;
        } else if (j.salary.min || j.salary.max) {
          const min = j.salary.min
            ? `${(j.salary.min / 1000).toFixed(0)}k`
            : "?";
          const max = j.salary.max
            ? `${(j.salary.max / 1000).toFixed(0)}k`
            : "?";
          const curr = j.salary.currency ?? "CZK";
          salary = `${min} – ${max} ${curr}`;
        }
      }

      // Strip HTML from description for AI analysis
      const rawDesc: string = j.description ?? j.perex ?? "";
      const cleanDesc = rawDesc
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);

      const slug: string = j.url ?? j.slug ?? "";
      const jobUrl = slug.startsWith("http")
        ? slug
        : `https://www.startupjobs.cz${slug}`;

      allJobs.push({
        externalId: `startupjobs-${j.id ?? Date.now()}`,
        title,
        company: j.company ?? j.companyName ?? "Neznáma firma",
        location: offerLocations || location,
        description: cleanDesc,
        salary,
        url: jobUrl,
        portal: "startupjobs.cz",
      });
    }
  }

  console.log(
    `[scraper] startupjobs.cz found ${allJobs.length} results for "${query}" (${location})`,
  );
  return allJobs;
}

// ---------------------------------------------------------------------------
// prace.cz – HTML scraping
// ---------------------------------------------------------------------------

async function scrapePraceCz(
  query: string,
  location: string = "Praha",
  maxPages: number = 2,
): Promise<ScrapedJob[]> {
  const keyword = encodeURIComponent(query.replace(/\s+/g, "-"));
  const locLower = location.toLowerCase().trim();

  // Build base URL
  let baseUrl: string;
  if (!locLower || locLower === "all") {
    baseUrl = `https://www.prace.cz/nabidky/?keyword=${encodeURIComponent(query)}`;
  } else if (locLower === "praha" || locLower === "prague") {
    baseUrl = `https://www.prace.cz/nabidky/hlavni-mesto-praha/praha/${keyword}/`;
  } else if (locLower === "brno") {
    baseUrl = `https://www.prace.cz/nabidky/jihomoravsky-kraj/brno/${keyword}/`;
  } else if (locLower === "ostrava") {
    baseUrl = `https://www.prace.cz/nabidky/moravskoslezsky-kraj/ostrava/${keyword}/`;
  } else if (locLower === "plzeň" || locLower === "plzen") {
    baseUrl = `https://www.prace.cz/nabidky/plzensky-kraj/plzen/${keyword}/`;
  } else {
    baseUrl = `https://www.prace.cz/nabidky/?keyword=${encodeURIComponent(query)}&locality=${encodeURIComponent(location)}`;
  }

  const allJobs: ScrapedJob[] = [];

  for (let page = 1; page <= maxPages; page++) {
    // Add pagination param
    const sep = baseUrl.includes("?") ? "&" : "?";
    const url = page === 1 ? baseUrl : `${baseUrl}${sep}page=${page}`;

    console.log(`[scraper] prace.cz → ${url}`);

    const res = await safeFetch(url);
    if (!res) break;

    const html = await res.text();
    const $ = cheerio.load(html);

    let pageCount = 0;

    $("li.search-result__advert").each((_i, el) => {
      const $el = $(el);

      const $titleLink = $el.find("h3 a.link");
      const title = $titleLink.find("strong").text().trim() || $titleLink.text().trim();
      let jobUrl = $titleLink.attr("href") ?? "";
      if (jobUrl && !jobUrl.startsWith("http")) {
        jobUrl = `https://www.prace.cz${jobUrl}`;
      }

      const jobId =
        $titleLink.attr("data-jd") ??
        $titleLink.attr("id") ??
        `${Date.now()}-${_i}`;

      const company =
        $el.find(".search-result__advert__box__item--company").clone().children().remove().end().text().trim() || "Neznáma firma";

      const locationText =
        $el.find(".search-result__advert__box__item--location strong").text().trim() || location;

      const salary =
        $el.find(".search-result__advert__box__item--salary").text().replace(/\u00A0/g, " ").replace(/\u200D/g, "").replace(/\s+/g, " ").trim() || undefined;

      const employmentType =
        $el.find(".search-result__advert__box__item--employment-type").clone().children().remove().end().text().trim() || "";

      if (title) {
        allJobs.push({
          externalId: `pracecz-${jobId}`,
          title,
          company,
          location: locationText,
          description: employmentType ? `Typ: ${employmentType}` : "",
          salary,
          url: jobUrl,
          portal: "prace.cz",
        });
        pageCount++;
      }
    });

    if (pageCount === 0) break;
  }

  console.log(`[scraper] prace.cz found ${allJobs.length} results for "${query}" (${maxPages} pages)`);
  return allJobs;
}

// ---------------------------------------------------------------------------
// OpenAI client (lazy)
// ---------------------------------------------------------------------------

let _openai: OpenAIType | null = null;

async function getOpenAI(): Promise<OpenAIType> {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new Error("OPENAI_API_KEY environment variable is not set");
    const { default: OpenAI } = await import("openai");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// AI analysis engine — enhanced with CV matching, distance, work mode
// ---------------------------------------------------------------------------

export interface CvSummary {
  name: string;
  targetRole: string;
  skills: string[];
  textSnippet: string; // first ~2000 chars of extracted CV text
}

export async function analyseJobWithAI(
  job: ScrapedJob,
  categories: string[],
  watcher: { jobType?: string | null; remoteOption?: string | null; location?: string | null; minMatchScore?: number | null },
  customLabelMap?: Record<string, string>,
  cvSummaries?: CvSummary[],
  distanceKm?: number | null,
): Promise<AiAnalysis> {
  const openai = await getOpenAI();

  const categoryDescriptions = categories
    .map((c) => CATEGORY_LABELS[c as JobCategory] ?? customLabelMap?.[c] ?? c)
    .join(", ");

  // Build context from watcher settings so AI can score accurately
  const requirements: string[] = [];
  if (watcher.location) requirements.push(`Candidate location: ${watcher.location}`);
  if (distanceKm != null) {
    requirements.push(`Distance from candidate to job: ~${distanceKm.toFixed(1)} km`);
  }
  if (watcher.jobType && watcher.jobType !== "any") {
    const typeMap: Record<string, string> = { "full-time": "full-time", "part-time": "part-time", contract: "contract/freelance" };
    requirements.push(`Preferred job type: ${typeMap[watcher.jobType] ?? watcher.jobType}`);
  }
  if (watcher.remoteOption && watcher.remoteOption !== "any") {
    const remoteMap: Record<string, string> = { remote: "fully remote", hybrid: "hybrid", onsite: "on-site" };
    requirements.push(`Preferred work mode: ${remoteMap[watcher.remoteOption] ?? watcher.remoteOption}`);
  }

  // CV data block
  let cvBlock = "";
  if (cvSummaries && cvSummaries.length > 0) {
    cvBlock = "\n\nCandidate has uploaded the following CVs:\n";
    for (const cv of cvSummaries) {
      cvBlock += `\n--- CV: "${cv.name}" (target role: ${cv.targetRole || "general"}) ---\n`;
      cvBlock += `Key skills: ${cv.skills.join(", ") || "not specified"}\n`;
      if (cv.textSnippet) {
        cvBlock += `CV content excerpt:\n${cv.textSnippet}\n`;
      }
    }
    cvBlock += `\nThe candidate has ${cvSummaries.length} CV(s). A job that matches ANY of these CVs should score higher. If a job matches multiple CVs, score even higher.`;
  } else {
    cvBlock = "\n\nNo CV uploaded — score purely based on how appealing the job seems for the given categories.";
  }

  const requirementsBlock = requirements.length > 0
    ? `\nCandidate requirements:\n${requirements.map(r => `- ${r}`).join("\n")}`
    : "";

  const distanceNote = distanceKm != null
    ? `\nDistance scoring: The job is ~${distanceKm.toFixed(1)} km from the candidate. Within 5 km = +10 points, 5-15 km = +5, 15-30 km = 0, 30+ km = -5.`
    : "";

  const workModeNote = watcher.remoteOption && watcher.remoteOption !== "any"
    ? `\nWork mode scoring: If the job matches the candidate's preferred "${watcher.remoteOption}" mode, add +5 points. If it clearly conflicts (e.g. candidate wants remote but job is onsite-only), subtract -3 points. If not specified in the listing, assume neutral (0).`
    : "";

  const systemPrompt = `You are a generous job matching assistant. The candidate is looking for positions matching these categories: ${categoryDescriptions}.${requirementsBlock}${cvBlock}${distanceNote}${workModeNote}

Scoring rules:
- Start at 55 (baseline for any job that is at least tangentially related to the candidate's interests).
- Be somewhat generous — if a job COULD be a reasonable fit, score it favorably, but distinguish weak from strong fits clearly.
- CV match: If CVs are provided, evaluate how well the job fits the candidate's skills/experience from ALL CVs. A reasonable CV match = +10-15 points. A strong CV match = +15-25 points. A job that fits multiple CVs = up to +30 points. Even partial skill overlap should earn +5-10.
- If no CVs: Score based on how appealing and relevant the job is for the given categories.
- Category match: +10-25 points (how well the job fits the listed categories). Even a partial match should get +10.
- Distance: Apply the distance scoring rules above
- Work mode: Apply the work mode scoring rules above
- Job type match: +3 if matches, -5 if conflicts
- Salary: +5 if stated and competitive, +2 if stated at all
- Seniority: Only subtract -5 if the job CLEARLY requires 5+ years of specific experience. Junior/entry-level and mid-level jobs should not be penalized.
- The more categories + CVs a job matches, the higher the score
- Score 90+ = excellent match, 75-89 = strong, 60-74 = decent, 45-59 = weak, below 45 = poor
- Good jobs should score 65-85. Mediocre relevance should land 50-65. Poor matches below 50.

For cvMatchScores: provide a score (0-100) for each CV name showing how well this job matches that specific CV.

Respond ONLY with a valid JSON object – no markdown, no extra text.`;

  const userPrompt = `Job listing to evaluate:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
${job.salary ? `Salary: ${job.salary}` : ""}
Portal: ${job.portal}
Description: ${job.description.slice(0, 1500)}

Respond with JSON matching this TypeScript interface:
{
  score: number,           // 0–100, overall match score
  reason: string,          // one concise sentence explaining the score
  pros: string[],          // up to 4 positives
  cons: string[],          // up to 4 negatives or concerns
  suggestedCvHint: string, // which CV variant would fit best
  matchedCategories: string[], // subset of [${categories.map((c) => `"${c}"`).join(", ")}] that this job matches
  cvMatchScores: {${cvSummaries?.map(cv => `"${cv.name}": number`).join(", ") || ""}}, // per-CV match score 0-100
  workModeMatch: boolean   // true if job matches the candidate's preferred work mode
}`;

  const MAX_RETRIES = 4;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as Partial<AiAnalysis>;

      // Apply distance modifier to the AI score
      let finalScore = typeof parsed.score === "number"
        ? Math.min(100, Math.max(0, parsed.score))
        : 50;
      finalScore = Math.min(100, Math.max(0, finalScore + distanceScoreModifier(distanceKm ?? null)));

      return {
        score: finalScore,
        reason: parsed.reason ?? "",
        pros: Array.isArray(parsed.pros) ? parsed.pros : [],
        cons: Array.isArray(parsed.cons) ? parsed.cons : [],
        suggestedCvHint: parsed.suggestedCvHint ?? "",
        matchedCategories: Array.isArray(parsed.matchedCategories)
          ? parsed.matchedCategories
          : [],
        distanceKm: distanceKm ?? null,
        cvMatchScores: typeof parsed.cvMatchScores === "object" ? parsed.cvMatchScores : {},
        workModeMatch: typeof parsed.workModeMatch === "boolean" ? parsed.workModeMatch : undefined,
      };
    } catch (err: any) {
      // Retry on rate-limit (429) with exponential backoff
      if (err?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfterMs = parseInt(err?.headers?.get?.("retry-after-ms") ?? "0", 10) || (attempt * 2000);
        const waitMs = Math.max(retryAfterMs, attempt * 1500);
        console.log(`[scraper] OpenAI rate-limited, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.error(`[scraper] OpenAI analysis failed (attempt ${attempt}):`, err?.message ?? err);
      return {
        score: 0,
        reason: "AI analýza zlyhala",
        pros: [],
        cons: [],
        suggestedCvHint: "",
        matchedCategories: [],
        distanceKm: distanceKm ?? null,
        cvMatchScores: {},
      };
    }
  }

  // Should not reach here, but just in case
  return {
    score: 0,
    reason: "AI analýza zlyhala",
    pros: [],
    cons: [],
    suggestedCvHint: "",
    matchedCategories: [],
    distanceKm: distanceKm ?? null,
    cvMatchScores: {},
  };
}

// ---------------------------------------------------------------------------
// Concurrency-limited parallel execution
// ---------------------------------------------------------------------------

async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Progress callback type (for SSE streaming)
// ---------------------------------------------------------------------------

export type ScanProgressCallback = (progress: {
  phase: "scraping" | "analyzing";
  found: number;
  newJobs: number;
  analyzed: number;
  total: number;
  saved: number;
}) => void;

// ---------------------------------------------------------------------------
// Category parsing (unified format — every category is an object with terms)
// ---------------------------------------------------------------------------

interface CategoryObj {
  value: string;
  label: string;
  emoji?: string;
  terms: string[];
}

/** Parse jobCategories JSON. Handles both new format (objects) and legacy (bare strings). */
function parseSavedCategories(raw: string | null | undefined): CategoryObj[] {
  let arr: unknown[];
  try { arr = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  return arr.map((entry): CategoryObj | null => {
    if (typeof entry === "string") {
      // Legacy built-in id → resolve terms from CATEGORY_SEARCH_TERMS
      const terms = CATEGORY_SEARCH_TERMS[entry as JobCategory] ?? [entry];
      const label = CATEGORY_LABELS[entry as JobCategory] ?? entry;
      return { value: entry, label, emoji: "🔍", terms };
    }
    if (typeof entry === "object" && entry !== null && "terms" in entry) {
      const e = entry as CategoryObj;
      return { value: e.value ?? "unknown", label: e.label ?? e.value ?? "?", emoji: e.emoji ?? "🔍", terms: Array.isArray(e.terms) ? e.terms : [e.label] };
    }
    return null;
  }).filter((x): x is CategoryObj => x !== null);
}

// ---------------------------------------------------------------------------
// Main orchestration – run a single watcher
// ---------------------------------------------------------------------------

export interface RunWatcherResult {
  found: number;
  saved: number;
  skippedDuplicates: number;
  skippedLowScore: number;
  errors: string[];
}

/** Default: save top 150 jobs per scan */
const DEFAULT_MAX_SAVE = 150;

export async function runWatcher(
  watcherId: number,
  onProgress?: ScanProgressCallback,
  signal?: AbortSignal,
): Promise<RunWatcherResult> {
  const result: RunWatcherResult = {
    found: 0,
    saved: 0,
    skippedDuplicates: 0,
    skippedLowScore: 0,
    errors: [],
  };

  const config = db
    .select()
    .from(watcherConfigs)
    .where(eq(watcherConfigs.id, watcherId))
    .get();
  if (!config) {
    result.errors.push(`Watcher ${watcherId} not found`);
    return result;
  }

  // Parse categories (unified format — every entry has terms)
  const allCategories: CategoryObj[] = parseSavedCategories(config.jobCategories);

  // If nothing configured, use first 3 defaults
  if (allCategories.length === 0) {
    for (const key of DEFAULT_CATEGORIES.slice(0, 3)) {
      allCategories.push({
        value: key,
        label: CATEGORY_LABELS[key],
        emoji: "🔍",
        terms: CATEGORY_SEARCH_TERMS[key],
      });
    }
  }

  // Build unified lists for AI analysis
  const allCategoryLabels: string[] = allCategories.map((c) => `${c.emoji ?? "🔍"} ${c.label}`);
  const allCategoryIds: string[] = allCategories.map((c) => c.value);

  const minScore = config.minMatchScore ?? 50;
  const maxSave = DEFAULT_MAX_SAVE;
  const location = config.location ?? "Praha";

  // Extract just the city name for portal search URLs
  // Full address stays in `location` for geocoding/display
  const searchCity = extractCityFromLocation(location);
  console.log(`[scraper] Location: "${location}" → search city: "${searchCity}"`);

  // ── Load all active CVs and extract text for AI analysis ──
  const allCvRows = db.select().from(cvVersions).all().filter((cv: { isActive: boolean | null }) => cv.isActive !== false);
  const cvSummaries: CvSummary[] = [];
  for (const cv of allCvRows) {
    let textSnippet = "";
    // Use already-parsed text (from CV analysis) if available, otherwise extract via Vision
    if (cv.parsedText) {
      textSnippet = cv.parsedText;
    } else if (cv.fileContent) {
      textSnippet = await extractTextFromImage(cv.fileContent);
    }
    let skills: string[] = [];
    try { skills = JSON.parse(cv.skills || "[]"); } catch {}
    cvSummaries.push({
      name: cv.name,
      targetRole: cv.targetRole ?? "",
      skills,
      textSnippet: textSnippet.slice(0, 2000),
    });
  }
  console.log(`[scraper] Loaded ${cvSummaries.length} active CV(s) for AI analysis`);

  // ── Resolve user's exact coordinates for distance scoring ──
  let userCoords: GeoCoords | null = null;
  if ((config as any).locationLat && (config as any).locationLng) {
    userCoords = { lat: (config as any).locationLat, lng: (config as any).locationLng };
    console.log(`[scraper] User coordinates from watcher: ${userCoords.lat}, ${userCoords.lng}`);
  } else if (location) {
    userCoords = await geocodeLocation(location);
    if (userCoords) {
      console.log(`[scraper] Geocoded "${location}" → ${userCoords.lat}, ${userCoords.lng}`);
    } else {
      // Fallback to known city coordinates
      const cityKey = searchCity.toLowerCase();
      if (CITY_COORDS[cityKey]) {
        userCoords = CITY_COORDS[cityKey];
        console.log(`[scraper] Using known coords for "${searchCity}" → ${userCoords.lat}, ${userCoords.lng}`);
      }
    }
  }

  // Load existing externalIds for dedup
  const existingRows = db
    .select({ externalId: jobListings.externalId })
    .from(jobListings)
    .all();
  const existingIds = new Set<string>(
    existingRows
      .map((r: { externalId: string | null }) => r.externalId ?? "")
      .filter(Boolean),
  );

  // Exclude keywords
  const excludeKeywords: string[] = (() => {
    try {
      return JSON.parse(config.excludeKeywords ?? "[]");
    } catch {
      return [];
    }
  })();

  // ══════════════════════════════════════════════════════════════════
  // PHASE 1: Scrape as many jobs as possible — ALL categories × ALL search terms × ALL portals
  // ══════════════════════════════════════════════════════════════════
  const globalSeen = new Set<string>();
  const allScraped: ScrapedJob[] = [];

  console.log(
    `[scraper] Watcher #${watcherId}: scraping ${allCategories.length} categories × all terms × 3 portals`,
  );

  // Helper to scrape a list of terms
  async function scrapeTerms(terms: string[]) {
    for (const query of terms) {
      if (signal?.aborted) break;

      const [jobsCz, startupJobs, praceCz] = await Promise.all([
        scrapeJobsCz(query, searchCity).catch((err) => {
          result.errors.push(`jobs.cz "${query}": ${err}`);
          return [] as ScrapedJob[];
        }),
        scrapeStartupJobsCz(query, searchCity).catch((err) => {
          result.errors.push(`startupjobs.cz "${query}": ${err}`);
          return [] as ScrapedJob[];
        }),
        scrapePraceCz(query, searchCity).catch((err) => {
          result.errors.push(`prace.cz "${query}": ${err}`);
          return [] as ScrapedJob[];
        }),
      ]);

      for (const job of [...jobsCz, ...startupJobs, ...praceCz]) {
        if (!globalSeen.has(job.externalId)) {
          globalSeen.add(job.externalId);
          allScraped.push(job);
        }
      }

      // Tiny delay between queries to be nice to portals
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Scrape all categories (unified — each has its own terms)
  for (const cat of allCategories) {
    if (signal?.aborted) break;
    if (!cat.terms || cat.terms.length === 0) continue;
    await scrapeTerms(cat.terms);
  }

  result.found = allScraped.length;
  console.log(
    `[scraper] Watcher #${watcherId}: scraped ${allScraped.length} unique jobs total`,
  );

  onProgress?.({ phase: "scraping", found: result.found, newJobs: 0, analyzed: 0, total: 0, saved: 0 });

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Filter duplicates & excluded keywords
  // ══════════════════════════════════════════════════════════════════
  const needsAI: ScrapedJob[] = [];
  for (const job of allScraped) {
    if (existingIds.has(job.externalId)) {
      result.skippedDuplicates++;
      continue;
    }
    const titleAndDesc = `${job.title} ${job.description}`.toLowerCase();
    const shouldExclude = excludeKeywords.some((kw) =>
      titleAndDesc.includes(kw.toLowerCase()),
    );
    if (shouldExclude) {
      result.skippedLowScore++;
      continue;
    }
    needsAI.push(job);
  }

  const newJobCount = needsAI.length;
  console.log(
    `[scraper] Watcher #${watcherId}: ${needsAI.length} new jobs to AI-analyse (${result.skippedDuplicates} duplicates skipped)`,
  );

  onProgress?.({ phase: "analyzing", found: result.found, newJobs: newJobCount, analyzed: 0, total: needsAI.length, saved: 0 });

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3: AI-analyse EVERY new job (parallel, 10 concurrent)
  //          Now includes CV matching + distance scoring
  // ══════════════════════════════════════════════════════════════════
  let analyzed = 0;
  const analysedJobs: { job: ScrapedJob; analysis: AiAnalysis }[] = [];

  // Build label map for AI (once, reused for all jobs)
  const customLabelMap: Record<string, string> = {};
  for (const c of allCategories) {
    customLabelMap[c.value] = `${c.emoji ?? "🔍"} ${c.label}`;
  }

  // Fast city-based distance estimation — no Nominatim calls needed
  console.log(`[scraper] Using fast city-based distance estimation (user city: "${searchCity}")`);

  if (!signal?.aborted) {
    await parallelMap(needsAI, 5, async (job) => {
      if (signal?.aborted) {
        analyzed++;
        onProgress?.({ phase: "analyzing", found: result.found, newJobs: newJobCount, analyzed, total: needsAI.length, saved: result.saved });
        return;
      }

      // Estimate distance using city names (instant, no API calls)
      const distanceKm = estimateDistanceKm(searchCity, userCoords, job.location);

      let analysis: AiAnalysis;
      try {
        analysis = await analyseJobWithAI(
          job,
          allCategoryIds,
          {
            jobType: config.jobType,
            remoteOption: config.remoteOption,
            location: config.location,
            minMatchScore: config.minMatchScore,
          },
          customLabelMap,
          cvSummaries.length > 0 ? cvSummaries : undefined,
          distanceKm,
        );
      } catch (err) {
        result.errors.push(`AI error for "${job.title}": ${String(err)}`);
        analysis = {
          score: 0,
          reason: "AI chyba",
          pros: [],
          cons: [],
          suggestedCvHint: "",
          matchedCategories: [],
        };
      }

      analyzed++;
      analysedJobs.push({ job, analysis });
      onProgress?.({ phase: "analyzing", found: result.found, newJobs: newJobCount, analyzed, total: needsAI.length, saved: result.saved });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 4: Sort by AI score desc → save top N above minScore
  // ══════════════════════════════════════════════════════════════════
  analysedJobs.sort((a, b) => b.analysis.score - a.analysis.score);

  const aboveThreshold = analysedJobs.filter((j) => j.analysis.score >= minScore);
  const topN = aboveThreshold.slice(0, maxSave);

  console.log(
    `[scraper] Watcher #${watcherId}: ${analysedJobs.length} analysed → ${aboveThreshold.length} above minScore ${minScore} → saving top ${topN.length}`,
  );

  for (const { job, analysis } of topN) {
    const now = new Date().toISOString();
    db.insert(jobListings)
      .values({
        externalId: job.externalId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        salary: job.salary ?? null,
        portal: job.portal,
        url: job.url,
        matchScore: analysis.score,
        matchReason: analysis.reason,
        aiAnalysis: JSON.stringify(analysis),
        status: "new",
        discoveredAt: now,
        updatedAt: now,
      })
      .run();
    result.saved++;
  }

  result.skippedLowScore += analysedJobs.length - aboveThreshold.length;

  // Final progress
  onProgress?.({ phase: "analyzing", found: result.found, newJobs: newJobCount, analyzed, total: needsAI.length, saved: result.saved });

  // Update lastCheckedAt
  db.update(watcherConfigs)
    .set({ lastCheckedAt: new Date().toISOString() })
    .where(eq(watcherConfigs.id, watcherId))
    .run();

  console.log(
    `[scraper] Watcher #${watcherId} done: found=${result.found} saved=${result.saved} dupSkip=${result.skippedDuplicates} lowScoreSkip=${result.skippedLowScore}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Run ALL active watchers
// ---------------------------------------------------------------------------

export async function runAllActiveWatchers(): Promise<void> {
  const active = db
    .select()
    .from(watcherConfigs)
    .all()
    .filter((w: { isActive: boolean | null }) => w.isActive);
  for (const w of active) {
    console.log(`[scraper] Running watcher #${w.id} "${w.name}"…`);
    const res = await runWatcher(w.id);
    console.log(
      `[scraper] Watcher #${w.id} done – found ${res.found}, saved ${res.saved}, skipped ${res.skippedDuplicates + res.skippedLowScore}`,
    );
    if (res.errors.length) console.warn(`[scraper] Errors:`, res.errors);
  }
}
