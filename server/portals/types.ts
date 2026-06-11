/**
 * Shared types + fetch helper for portal scrapers.
 *
 * Each portal lives in its own module and exports a `PortalScraper`
 * implementation. See ./index.ts for the registry.
 */

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

export type PortalCountry = "cz" | "sk" | "both";

export interface PortalScraper {
  id: string;            // e.g. "jobs.cz"
  name: string;          // display name
  country: PortalCountry;
  scrape(query: string, city: string, maxPages?: number): Promise<ScrapedJob[]>;
}

// ---------------------------------------------------------------------------
// Common fetch helper
// ---------------------------------------------------------------------------

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function safeFetch(
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
// Small shared utilities
// ---------------------------------------------------------------------------

/** Lowercase + strip diacritics ("Plzeň" → "plzen") for robust comparisons. */
export function normalizeCity(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
