/**
 * prace.cz – HTML scraping
 */

import * as cheerio from "cheerio";
import { safeFetch, normalizeCity, type PortalScraper, type ScrapedJob } from "./types.js";

// ---------------------------------------------------------------------------
// Locality slugs — prace.cz URLs use /nabidky/<kraj-slug>/<city-slug>/
// Keys are normalized (lowercase, no diacritics) city names.
// ---------------------------------------------------------------------------

const PRACE_CZ_LOCALITY_SLUGS: Record<string, string> = {
  praha: "hlavni-mesto-praha/praha",
  prague: "hlavni-mesto-praha/praha",
  brno: "jihomoravsky-kraj/brno",
  ostrava: "moravskoslezsky-kraj/ostrava",
  plzen: "plzensky-kraj/plzen",
  olomouc: "olomoucky-kraj/olomouc",
  liberec: "liberecky-kraj/liberec",
  "ceske budejovice": "jihocesky-kraj/ceske-budejovice",
  "hradec kralove": "kralovehradecky-kraj/hradec-kralove",
  "usti nad labem": "ustecky-kraj/usti-nad-labem",
  pardubice: "pardubicky-kraj/pardubice",
  zlin: "zlinsky-kraj/zlin",
  jihlava: "kraj-vysocina/jihlava",
  "karlovy vary": "karlovarsky-kraj/karlovy-vary",
};

async function scrapePraceCz(
  query: string,
  location: string = "Praha",
  maxPages: number = 2,
): Promise<ScrapedJob[]> {
  // prace.cz redesign (2026): keyword-in-path slugs are ignored; the search
  // now uses a `q[]=` query param (same format as jobs.cz — both run on LMC).
  const q = `q%5B%5D=${encodeURIComponent(query)}`;
  const locNorm = normalizeCity(location);

  // Build base URL — locality path slugs still work, keyword goes into ?q[]=
  // Unknown / empty city → country-wide search.
  let baseUrl: string;
  if (!locNorm || locNorm === "all") {
    baseUrl = `https://www.prace.cz/nabidky/?${q}`;
  } else if (PRACE_CZ_LOCALITY_SLUGS[locNorm]) {
    baseUrl = `https://www.prace.cz/nabidky/${PRACE_CZ_LOCALITY_SLUGS[locNorm]}/?${q}`;
  } else {
    baseUrl = `https://www.prace.cz/nabidky/?${q}`;
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

    // New markup (2026 redesign): <article id="advert-<uuid>" class="JobCard-module…">
    // Field values sit next to an accessibility label span
    // ("Lokalita:", "Název firmy:", "Typ úvazku:", "Plat:").
    $('article[id^="advert-"]').each((_i, el) => {
      const $el = $(el);

      const $titleLink = $el.find('h2[data-testid="job-card-title"] a, a[data-testid="advert-link"]').first();
      const title = $titleLink.text().trim();
      let jobUrl = $titleLink.attr("href") ?? "";
      if (jobUrl && !jobUrl.startsWith("http")) {
        jobUrl = `https://www.prace.cz${jobUrl}`;
      }

      const jobId =
        ($el.attr("id") ?? "").replace(/^advert-/, "") || `${Date.now()}-${_i}`;

      // Collect label → value pairs from the card body
      const fields: Record<string, string> = {};
      $el.find("span.accessibility-hidden").each((_j, lab) => {
        const label = $(lab).text().replace(/:\s*$/, "").trim();
        const value = $(lab)
          .next("span")
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .replace(/ /g, " ")
          .replace(/‍/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (label && value) fields[label] = value;
      });

      const company = fields["Název firmy"] || "Neznáma firma";
      const locationText = fields["Lokalita"] || location;
      const salary = fields["Plat"] || undefined;
      const employmentType = fields["Typ úvazku"] || "";

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

export const praceCzPortal: PortalScraper = {
  id: "prace.cz",
  name: "Práce.cz",
  country: "cz",
  scrape: scrapePraceCz,
};
