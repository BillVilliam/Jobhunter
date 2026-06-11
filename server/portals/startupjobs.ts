/**
 * startupjobs.cz – JSON API (lists both CZ and SK offers)
 */

import { safeFetch, type PortalScraper, type ScrapedJob } from "./types.js";

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

export const startupJobsPortal: PortalScraper = {
  id: "startupjobs.cz",
  name: "StartupJobs",
  country: "both",
  scrape: scrapeStartupJobsCz,
};
