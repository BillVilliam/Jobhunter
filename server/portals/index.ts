/**
 * Portal registry — all supported job portals in one place.
 *
 * Usage:
 *   import { PORTALS, portalsForCountry } from "./portals/index.js";
 *   const portals = portalsForCountry("sk");
 *   const jobs = await portals[0].scrape("devops", "Bratislava");
 */

import type { PortalScraper } from "./types.js";
import { jobsCzPortal } from "./jobs-cz.js";
import { praceCzPortal } from "./prace-cz.js";
import { startupJobsPortal } from "./startupjobs.js";
import { profesiaSkPortal } from "./profesia-sk.js";
import { karieraSkPortal } from "./kariera-sk.js";

export type { ScrapedJob, PortalScraper, PortalCountry } from "./types.js";
export { safeFetch, BROWSER_UA, normalizeCity } from "./types.js";
export { jobsCzPortal } from "./jobs-cz.js";
export { praceCzPortal } from "./prace-cz.js";
export { startupJobsPortal } from "./startupjobs.js";
export { profesiaSkPortal } from "./profesia-sk.js";
export { karieraSkPortal } from "./kariera-sk.js";

/** All portals — CZ first, then cross-country, then SK. */
export const PORTALS: PortalScraper[] = [
  jobsCzPortal,
  praceCzPortal,
  startupJobsPortal,
  profesiaSkPortal,
  karieraSkPortal,
];

/**
 * Pick portals for a target country:
 *   "cz"   → CZ portals + portals serving both countries
 *   "sk"   → SK portals + portals serving both countries
 *   "both" → all portals
 */
export function portalsForCountry(country: "cz" | "sk" | "both"): PortalScraper[] {
  if (country === "both") return [...PORTALS];
  return PORTALS.filter((p) => p.country === country || p.country === "both");
}
