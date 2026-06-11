/**
 * kariera.zoznam.sk – HTML scraping (Slovak portal, best-effort)
 *
 * Search URL: https://kariera.zoznam.sk/praca/?q=<query>
 *
 * The markup is uncertain, so parsing tries several container/selector
 * combinations and logs a warning + returns [] when nothing matches.
 */

import * as cheerio from "cheerio";
import { safeFetch, normalizeCity, type PortalScraper, type ScrapedJob } from "./types.js";

async function scrapeKarieraSk(
  query: string,
  location: string = "",
  maxPages: number = 1,
): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const cityNorm = normalizeCity(location);
  const filterByCity = Boolean(cityNorm) && cityNorm !== "all";

  try {
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({ q: query });
      if (page > 1) params.set("page", String(page));

      const url = `https://kariera.zoznam.sk/praca/?${params.toString()}`;
      console.log(`[scraper] kariera.sk → ${url}`);

      const res = await safeFetch(url);
      if (!res) break;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Try multiple container conventions — markup is uncertain
      let $offers = $("article");
      if ($offers.length === 0) $offers = $('div[class*="offer"]');
      if ($offers.length === 0) $offers = $('li[class*="offer"]');
      if ($offers.length === 0) $offers = $('div[class*="job"], li[class*="job"]');

      if ($offers.length === 0) {
        console.warn(`[scraper] kariera.sk: no offer containers found — markup may have changed`);
        break;
      }

      let pageCount = 0;

      $offers.each((_i, el) => {
        const $el = $(el);

        const $titleLink = $el.find("h2 a, h3 a, a[class*='title']").first();
        const title = $titleLink.text().replace(/\s+/g, " ").trim();
        if (!title) return;

        let jobUrl = $titleLink.attr("href") ?? "";
        if (jobUrl && !jobUrl.startsWith("http")) {
          jobUrl = `https://kariera.zoznam.sk${jobUrl.startsWith("/") ? "" : "/"}${jobUrl}`;
        }

        // externalId — derive from the offer URL slug, fallback to a counter
        const slug = jobUrl
          .replace(/^https?:\/\/[^/]+/, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const offerId = slug || `${Date.now()}-${_i}`;

        const company =
          $el.find('[class*="company"], [class*="employer"]').first().text().replace(/\s+/g, " ").trim() ||
          "Neznáma firma";

        const locationText =
          $el.find('[class*="location"], [class*="place"]').first().text().replace(/\s+/g, " ").trim();

        // City filter — diacritics-insensitive substring match
        if (filterByCity && locationText && !normalizeCity(locationText).includes(cityNorm)) {
          return;
        }

        const salary =
          $el.find('[class*="salary"]').first().text().replace(/\s+/g, " ").trim() || undefined;

        const description =
          $el.find('p, [class*="description"], [class*="perex"]').first().text().replace(/\s+/g, " ").trim().slice(0, 1500);

        allJobs.push({
          externalId: `kariera-${offerId}`,
          title,
          company,
          location: locationText || location,
          description,
          salary,
          url: jobUrl,
          portal: "kariera.sk",
        });
        pageCount++;
      });

      // If this page had no parseable results, don't fetch more pages
      if (pageCount === 0) {
        console.warn(`[scraper] kariera.sk: containers found but nothing parsed — markup may have changed`);
        break;
      }
    }
  } catch (err) {
    console.error(`[scraper] kariera.sk scrape error:`, err);
  }

  console.log(
    `[scraper] kariera.sk found ${allJobs.length} results for "${query}" (${location || "all"})`,
  );
  return allJobs;
}

export const karieraSkPortal: PortalScraper = {
  id: "kariera.sk",
  name: "Kariéra.sk",
  country: "sk",
  scrape: scrapeKarieraSk,
};
