/**
 * jobs.cz – HTML scraping
 */

import * as cheerio from "cheerio";
import { safeFetch, type PortalScraper, type ScrapedJob } from "./types.js";

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

export const jobsCzPortal: PortalScraper = {
  id: "jobs.cz",
  name: "Jobs.cz",
  country: "cz",
  scrape: scrapeJobsCz,
};
