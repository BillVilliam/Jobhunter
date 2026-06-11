// ---------------------------------------------------------------------------
// Locations — Czech Republic + Slovakia city knowledge, geocoding & distances
// Extracted from scraper.ts and extended to cover all of CZ and SK.
// Uses the free Nominatim API (OpenStreetMap) for the rare network lookups;
// everything else is pure string matching / math (NO API calls).
// ---------------------------------------------------------------------------

export type Country = "cz" | "sk";

export interface GeoCoords { lat: number; lng: number }

export interface CityInfo { name: string; country: Country; coords: GeoCoords }

// ---------------------------------------------------------------------------
// Normalization — all CITIES lookups go through normalizeKey so that
// "Plzeň", "plzen" and "PLZEN" all hit the same entry
// ---------------------------------------------------------------------------

/** Lowercase + strip diacritics + trim — canonical lookup key */
export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// City table — approximate coordinates for the largest CZ + SK cities
// Keys are normalizeKey()-normalized (diacritics stripped), one key per city
// ---------------------------------------------------------------------------

export const CITIES: Record<string, CityInfo> = {
  // --- Czech Republic ---
  "praha":              { name: "Praha",              country: "cz", coords: { lat: 50.0755, lng: 14.4378 } },
  "brno":               { name: "Brno",               country: "cz", coords: { lat: 49.1951, lng: 16.6068 } },
  "ostrava":            { name: "Ostrava",            country: "cz", coords: { lat: 49.8209, lng: 18.2625 } },
  "plzen":              { name: "Plzeň",              country: "cz", coords: { lat: 49.7384, lng: 13.3736 } },
  "liberec":            { name: "Liberec",            country: "cz", coords: { lat: 50.7671, lng: 15.0562 } },
  "olomouc":            { name: "Olomouc",            country: "cz", coords: { lat: 49.5938, lng: 17.2509 } },
  "ceske budejovice":   { name: "České Budějovice",   country: "cz", coords: { lat: 48.9745, lng: 14.4747 } },
  "hradec kralove":     { name: "Hradec Králové",     country: "cz", coords: { lat: 50.2092, lng: 15.8328 } },
  "usti nad labem":     { name: "Ústí nad Labem",     country: "cz", coords: { lat: 50.6611, lng: 14.0531 } },
  "pardubice":          { name: "Pardubice",          country: "cz", coords: { lat: 50.0343, lng: 15.7812 } },
  "zlin":               { name: "Zlín",               country: "cz", coords: { lat: 49.2268, lng: 17.6673 } },
  "havirov":            { name: "Havířov",            country: "cz", coords: { lat: 49.7798, lng: 18.4368 } },
  "kladno":             { name: "Kladno",             country: "cz", coords: { lat: 50.1473, lng: 14.1029 } },
  "most":               { name: "Most",               country: "cz", coords: { lat: 50.5031, lng: 13.6362 } },
  "opava":              { name: "Opava",              country: "cz", coords: { lat: 49.9387, lng: 17.9026 } },
  "frydek-mistek":      { name: "Frýdek-Místek",      country: "cz", coords: { lat: 49.6883, lng: 18.3505 } },
  "karvina":            { name: "Karviná",            country: "cz", coords: { lat: 49.8541, lng: 18.5417 } },
  "jihlava":            { name: "Jihlava",            country: "cz", coords: { lat: 49.3961, lng: 15.5912 } },
  "teplice":            { name: "Teplice",            country: "cz", coords: { lat: 50.6404, lng: 13.8245 } },
  "decin":              { name: "Děčín",              country: "cz", coords: { lat: 50.7821, lng: 14.2148 } },
  "karlovy vary":       { name: "Karlovy Vary",       country: "cz", coords: { lat: 50.2316, lng: 12.8716 } },
  "chomutov":           { name: "Chomutov",           country: "cz", coords: { lat: 50.4605, lng: 13.4178 } },
  "mlada boleslav":     { name: "Mladá Boleslav",     country: "cz", coords: { lat: 50.4114, lng: 14.9032 } },
  "prostejov":          { name: "Prostějov",          country: "cz", coords: { lat: 49.4720, lng: 17.1067 } },
  "prerov":             { name: "Přerov",             country: "cz", coords: { lat: 49.4554, lng: 17.4509 } },
  // --- Slovakia ---
  "bratislava":         { name: "Bratislava",         country: "sk", coords: { lat: 48.1486, lng: 17.1077 } },
  "kosice":             { name: "Košice",             country: "sk", coords: { lat: 48.7164, lng: 21.2611 } },
  "presov":             { name: "Prešov",             country: "sk", coords: { lat: 48.9986, lng: 21.2339 } },
  "zilina":             { name: "Žilina",             country: "sk", coords: { lat: 49.2231, lng: 18.7394 } },
  "nitra":              { name: "Nitra",              country: "sk", coords: { lat: 48.3069, lng: 18.0845 } },
  "banska bystrica":    { name: "Banská Bystrica",    country: "sk", coords: { lat: 48.7363, lng: 19.1462 } },
  "trnava":             { name: "Trnava",             country: "sk", coords: { lat: 48.3774, lng: 17.5883 } },
  "trencin":            { name: "Trenčín",            country: "sk", coords: { lat: 48.8945, lng: 18.0444 } },
  "martin":             { name: "Martin",             country: "sk", coords: { lat: 49.0664, lng: 18.9216 } },
  "poprad":             { name: "Poprad",             country: "sk", coords: { lat: 49.0551, lng: 20.2978 } },
  "prievidza":          { name: "Prievidza",          country: "sk", coords: { lat: 48.7746, lng: 18.6273 } },
  "zvolen":             { name: "Zvolen",             country: "sk", coords: { lat: 48.5762, lng: 19.1371 } },
  "povazska bystrica":  { name: "Považská Bystrica",  country: "sk", coords: { lat: 49.1209, lng: 18.4549 } },
  "nove zamky":         { name: "Nové Zámky",         country: "sk", coords: { lat: 47.9855, lng: 18.1620 } },
  "michalovce":         { name: "Michalovce",         country: "sk", coords: { lat: 48.7553, lng: 21.9186 } },
  "spisska nova ves":   { name: "Spišská Nová Ves",   country: "sk", coords: { lat: 48.9446, lng: 20.5615 } },
  "komarno":            { name: "Komárno",            country: "sk", coords: { lat: 47.7633, lng: 18.1289 } },
  "levice":             { name: "Levice",             country: "sk", coords: { lat: 48.2153, lng: 18.6069 } },
  "humenne":            { name: "Humenné",            country: "sk", coords: { lat: 48.9370, lng: 21.9069 } },
  "liptovsky mikulas":  { name: "Liptovský Mikuláš",  country: "sk", coords: { lat: 49.0843, lng: 19.6122 } },
};

/** Common English/German exonyms → canonical (normalized) CITIES keys */
const CITY_ALIASES: Record<string, string> = {
  prague: "praha",
  pilsen: "plzen",
  budweis: "ceske budejovice",
  carlsbad: "karlovy vary",
  pressburg: "bratislava",
  kaschau: "kosice",
};

/** Keys of CITIES + aliases, longest first so multi-word names win
 *  (e.g. "povazska bystrica" before "martin") */
const CITY_KEYS_BY_LENGTH: string[] = [
  ...Object.keys(CITIES),
  ...Object.keys(CITY_ALIASES),
].sort((a, b) => b.length - a.length);

/** Resolve a normalized key (canonical or alias) to its CityInfo */
function cityByKey(key: string): CityInfo | null {
  return CITIES[key] ?? CITIES[CITY_ALIASES[key]] ?? null;
}

// ---------------------------------------------------------------------------
// City detection — find a known city mentioned anywhere in a location string
// "Hartigova 93, 130 00 Praha 3" → Praha
// ---------------------------------------------------------------------------

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findCity(location: string): CityInfo | null {
  if (!location) return null;
  const normalized = normalizeKey(location);

  // Direct match?
  const direct = cityByKey(normalized);
  if (direct) return direct;

  // Search for known city names within the location string (word-bounded so
  // e.g. "most" doesn't match inside other words)
  for (const key of CITY_KEYS_BY_LENGTH) {
    const re = new RegExp(`(^|[^a-z])${escapeRegExp(key)}([^a-z]|$)`);
    if (re.test(normalized)) return cityByKey(key);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Extract city name from a full address string
// "Hartigova 93, 130 00 Praha 3" → "Praha"
// "Brno" → "Brno"
// ---------------------------------------------------------------------------

export function extractCityFromLocation(location: string): string {
  if (!location) return "";

  // Direct or in-string known city match (CZ + SK)?
  const known = findCity(location);
  if (known) return known.name;

  // If it has a comma, try the last significant part (city is often last)
  // e.g. "Hartigova 93, 130 00 Praha 3" → try "Praha 3" → strip trailing digits → "Praha"
  const parts = location.split(",").map(s => s.trim());
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    // Strip postal code prefix (CZ "130 00" / SK "010 01" → same format)
    const withoutPostal = lastPart.replace(/^\d{3}\s?\d{2}\s*/, "").trim();
    // Strip trailing district number (e.g., "Praha 3" → "Praha")
    const withoutDistrict = withoutPostal.replace(/\s+\d+$/, "").trim();
    if (withoutDistrict) {
      // Check if it's a known city
      const city = cityByKey(normalizeKey(withoutDistrict));
      if (city) return city.name;
      return withoutDistrict;
    }
  }

  // Fallback — return as-is
  return location.trim();
}

// ---------------------------------------------------------------------------
// Country detection — pure string heuristics first, Nominatim as last resort
// ---------------------------------------------------------------------------

/** Detect country from a location string — pure heuristics, NO network */
export function detectCountry(location: string): Country | null {
  if (!location) return null;

  // 1) Known city mentioned anywhere → its country
  const city = findCity(location);
  if (city) return city.country;

  // 2) Country words
  const normalized = normalizeKey(location);
  if (
    normalized.includes("slovensko") ||
    normalized.includes("slovakia") ||
    normalized.includes("slovak")
  ) {
    return "sk";
  }
  if (
    normalized.includes("cesko") ||
    normalized.includes("czech") ||
    /(^|[^a-z])cr([^a-z]|$)/.test(normalized) // "ČR" → "cr" after normalization
  ) {
    return "cz";
  }

  // 3) Can't tell from the string alone
  return null;
}

const countryCache = new Map<string, Country>();

/**
 * Resolve the country of a location string.
 * detectCountry() first; if inconclusive, ONE Nominatim reverse lookup;
 * on any failure defaults to "cz".
 */
export async function resolveCountry(location: string): Promise<Country> {
  const detected = detectCountry(location);
  if (detected) return detected;

  const key = normalizeKey(location);
  if (countryCache.has(key)) return countryCache.get(key)!;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&addressdetails=1&countrycodes=cz,sk`;
    const res = await fetch(url, {
      headers: { "User-Agent": "JobHunter/1.0 (job search app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data: { address?: { country_code?: string } }[] = await res.json();
      const code = data[0]?.address?.country_code;
      const country: Country = code === "sk" ? "sk" : "cz";
      countryCache.set(key, country);
      return country;
    }
  } catch {
    // fall through to default
  }

  countryCache.set(key, "cz");
  return "cz";
}

// ---------------------------------------------------------------------------
// Geocoding — resolve location string → { lat, lng }
// Uses free Nominatim API (OpenStreetMap)
// ONLY used for the user's watcher location (single call), NOT for job locations
// ---------------------------------------------------------------------------

const geocodeCache = new Map<string, GeoCoords | null>();

export async function geocodeLocation(location: string): Promise<GeoCoords | null> {
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
        console.warn(`[locations] Nominatim rate-limited (attempt ${attempt + 1}/3)`);
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
  console.warn(`[locations] Geocoding failed for "${location}" after 3 attempts`);
  geocodeCache.set(key, null);
  return null;
}

/** Haversine distance in km between two lat/lng points */
export function haversineKm(a: GeoCoords, b: GeoCoords): number {
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

/** Remote-work phrases (normalized) — distance doesn't matter */
const REMOTE_PHRASES = ["remote", "home office", "praca z domu", "z domova"];

/**
 * Estimate distance between user's city and a job location string.
 * Returns km or null if can't determine.
 * This is FAST — no API calls, pure string matching.
 */
export function estimateDistanceKm(
  userCity: string,
  userCoords: GeoCoords | null,
  jobLocation: string,
): number | null {
  // No user city (location is optional) → distance unknown, score neutral
  if (!jobLocation || !userCity.trim()) return null;

  const userCityNorm = normalizeKey(userCity);
  const jobNorm = normalizeKey(jobLocation);

  // If job location contains the user's city → same city, estimate 5-10 km
  if (jobNorm.includes(userCityNorm) || userCityNorm.includes(jobNorm.split("–")[0].trim())) {
    return 5; // Same city
  }

  // Check known city names → extract the city from job location
  const jobCityKey = normalizeKey(extractCityFromLocation(jobLocation));

  if (jobCityKey === userCityNorm) return 5; // Same city after extraction

  const jobCity = cityByKey(jobCityKey);
  const userCityInfo = cityByKey(userCityNorm);

  // If we have user coords and the job city has known coords → haversine
  if (userCoords && jobCity) {
    return Math.round(haversineKm(userCoords, jobCity.coords));
  }

  // If both are known cities → haversine between known coords
  if (userCityInfo && jobCity) {
    return Math.round(haversineKm(userCityInfo.coords, jobCity.coords));
  }

  // Check if job mentions "remote" / "home office" / "práca z domu" /
  // "z domova" → distance doesn't matter
  if (REMOTE_PHRASES.some(p => jobNorm.includes(p))) return 0;

  // Can't determine
  return null;
}

/** Distance score modifier: 0-5 km = +10, 5-15 km = +5, 15-30 km = 0, 30+ km = -5 */
export function distanceScoreModifier(km: number | null): number {
  if (km == null) return 0;
  if (km <= 5) return 10;
  if (km <= 15) return 5;
  if (km <= 30) return 0;
  return -5;
}
