/**
 * profesia.sk – HTML scraping (Slovakia's #1 job portal)
 *
 * Search URL: https://www.profesia.sk/praca/?search_anywhere=<query>&page_num=<n>
 *
 * NOTE: written defensively — parsing falls back across multiple selectors and
 * the scraper always returns whatever it managed to collect (never throws).
 */

import * as cheerio from "cheerio";
import { safeFetch, normalizeCity, type PortalScraper, type ScrapedJob } from "./types.js";

/** Tiny deterministic hash for externalId fallback when no /O<digits> id exists. */
function hashString(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

async function scrapeProfesiaSk(
  query: string,
  location: string = "",
  maxPages: number = 2,
): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const cityNorm = normalizeCity(location);
  const filterByCity = Boolean(cityNorm) && cityNorm !== "all";

  try {
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({ search_anywhere: query });
      if (page > 1) params.set("page_num", String(page));

      const url = `https://www.profesia.sk/praca/?${params.toString()}`;
      console.log(`[scraper] profesia.sk → ${url}`);

      const res = await safeFetch(url);
      if (!res) break;

      const html = await res.text();
      const $ = cheerio.load(html);

      let pageCount = 0;

      // Primary markup: <li class="list-row"> offer cards.
      // Fallbacks cover potential markup drift.
      let $offers = $("li.list-row");
      if ($offers.length === 0) $offers = $('li[class*="list-row"]');
      if ($offers.length === 0) $offers = $('div[class*="list-row"]');

      $offers.each((_i, el) => {
        const $el = $(el);

        // Title + URL — usually <h2><a class="title" …>
        const $titleLink = $el.find("h2 a.title, h2 a, a.title").first();
        const title = $titleLink.text().trim();
        if (!title) return;

        let jobUrl = $titleLink.attr("href") ?? "";
        if (jobUrl && !jobUrl.startsWith("http")) {
          jobUrl = `https://www.profesia.sk${jobUrl.startsWith("/") ? "" : "/"}${jobUrl}`;
        }

        // externalId — profesia offer URLs end with /O<digits>
        const idMatch = jobUrl.match(/O(\d+)/);
        const offerId = idMatch ? idMatch[1] : hashString(jobUrl || `${title}-${_i}`);

        const company =
          $el.find("span.employer").first().text().trim() ||
          $el.find('[class*="employer"]').first().text().trim() ||
          "Neznáma firma";

        const locationText =
          $el.find("span.job-location").first().text().replace(/\s+/g, " ").trim() ||
          $el.find('[class*="job-location"], [class*="location"]').first().text().replace(/\s+/g, " ").trim();

        // City filter — diacritics-insensitive substring match
        if (filterByCity && locationText && !normalizeCity(locationText).includes(cityNorm)) {
          return;
        }

        const salary =
          $el.find("span.label-group a[data-dimension7]").first().text().replace(/\s+/g, " ").trim() ||
          $el.find('[class*="salary"]').first().text().replace(/\s+/g, " ").trim() ||
          undefined;

        // Short annotation/perex if present
        const description =
          $el.find('span[class*="info"], div[class*="annotation"], p').first().text().replace(/\s+/g, " ").trim().slice(0, 1500);

        allJobs.push({
          externalId: `profesia-${offerId}`,
          title,
          company,
          location: locationText || location,
          description,
          salary,
          url: jobUrl,
          portal: "profesia.sk",
        });
        pageCount++;
      });

      // If this page had no results, don't fetch more pages
      if (pageCount === 0) {
        if (page === 1 && $offers.length === 0) {
          console.warn(`[scraper] profesia.sk: no offer elements parsed — markup may have changed`);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[scraper] profesia.sk scrape error:`, err);
  }

  console.log(
    `[scraper] profesia.sk found ${allJobs.length} results for "${query}" (${location || "all"})`,
  );
  return allJobs;
}

export const profesiaSkPortal: PortalScraper = {
  id: "profesia.sk",
  name: "Profesia.sk",
  country: "sk",
  scrape: scrapeProfesiaSk,
};
