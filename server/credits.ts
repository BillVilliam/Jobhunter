/**
 * Credit system — meters AI API token usage and converts it to credits.
 *
 * Core idea: users spend credits, credits buy AI tokens. The conversion
 * ratio (how many API tokens one credit buys) is a SETTING stored in the
 * database — the exact number is intentionally not final yet and can be
 * changed at any time via PATCH /api/credits/settings without a deploy.
 *
 * Every AI call records a ledger row: action, raw tokens used, credits
 * deducted. Balance = sum of all creditsDelta rows. New installations get
 * a starter grant so the app works out of the box.
 */

import { db } from "./storage.js";
import { appSettings, creditLedger } from "@shared/schema.js";
import { eq, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Defaults — placeholders until the real pricing ratio is decided
// ---------------------------------------------------------------------------

/** How many AI API tokens one credit buys. PLACEHOLDER — tune later. */
export const DEFAULT_TOKENS_PER_CREDIT = 10_000;

/** Credits granted to a fresh installation/account. PLACEHOLDER — tune later. */
export const DEFAULT_STARTER_CREDITS = 100;

const TOKENS_PER_CREDIT_KEY = "tokensPerCredit";

/**
 * Fixed price per AI action, in credits. Scan = 1 by definition; the others
 * are cheaper because they're a single small AI call. All adjustable at
 * runtime via PATCH /api/credits/settings — no deploy needed.
 */
export interface ActionPrices {
  scan: number;
  coverLetter: number;
  cvAnalysis: number;
}

export const DEFAULT_ACTION_PRICES: ActionPrices = {
  scan: 1,
  coverLetter: 0.1,
  cvAnalysis: 0.2,
};

const ACTION_PRICES_KEY = "actionPrices";

export function getActionPrices(): ActionPrices {
  const row = db.select().from(appSettings).where(eq(appSettings.key, ACTION_PRICES_KEY)).get();
  if (!row) return { ...DEFAULT_ACTION_PRICES };
  try {
    const stored = JSON.parse(row.value) as Partial<ActionPrices>;
    return { ...DEFAULT_ACTION_PRICES, ...stored };
  } catch {
    return { ...DEFAULT_ACTION_PRICES };
  }
}

export function setActionPrices(prices: Partial<ActionPrices>): ActionPrices {
  for (const [k, v] of Object.entries(prices)) {
    if (!Number.isFinite(v) || (v as number) < 0) {
      throw new Error(`Cena pre "${k}" musí byť číslo >= 0`);
    }
  }
  const merged = { ...getActionPrices(), ...prices };
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key: ACTION_PRICES_KEY, value: JSON.stringify(merged), updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(merged), updatedAt: now },
    })
    .run();
  return merged;
}

const ACTION_LEDGER_NAMES: Record<keyof ActionPrices, string> = {
  scan: "scan",
  coverLetter: "cover-letter",
  cvAnalysis: "cv-analysis",
};

/**
 * Charge the fixed price of an action. tokensUsed is recorded alongside for
 * cost monitoring (real API cost vs. the credit price we charge).
 */
export function chargeAction(action: keyof ActionPrices, tokensUsed: number, details?: string): void {
  const price = getActionPrices()[action];
  if (price <= 0 && tokensUsed <= 0) return;
  db.insert(creditLedger)
    .values({
      action: ACTION_LEDGER_NAMES[action],
      tokensUsed: tokensUsed > 0 ? tokensUsed : 0,
      creditsDelta: -price,
      details: details?.slice(0, 200) ?? null,
      timestamp: new Date().toISOString(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getTokensPerCredit(): number {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, TOKENS_PER_CREDIT_KEY))
    .get();
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKENS_PER_CREDIT;
}

export function setTokensPerCredit(tokens: number): void {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    throw new Error("tokensPerCredit must be a positive number");
  }
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key: TOKENS_PER_CREDIT_KEY, value: String(tokens), updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(tokens), updatedAt: now },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Balance & ledger
// ---------------------------------------------------------------------------

/** Grant starter credits once (first run on an empty ledger). */
function ensureStarterGrant(): void {
  const any = db.select({ id: creditLedger.id }).from(creditLedger).limit(1).get();
  if (any) return;
  db.insert(creditLedger)
    .values({
      action: "starter-grant",
      tokensUsed: 0,
      creditsDelta: DEFAULT_STARTER_CREDITS,
      details: "Úvodné kredity pre nový účet",
      timestamp: new Date().toISOString(),
    })
    .run();
  console.log(`[credits] Starter grant: ${DEFAULT_STARTER_CREDITS} credits`);
}

export function getCreditBalance(): number {
  ensureStarterGrant();
  const rows = db.select({ delta: creditLedger.creditsDelta }).from(creditLedger).all();
  const sum = rows.reduce((acc: number, r: { delta: number }) => acc + r.delta, 0);
  return Math.round(sum * 1000) / 1000;
}

export function hasCredits(): boolean {
  return getCreditBalance() > 0;
}

/**
 * Record raw AI token usage for measurement (feeds the active scan meter).
 * Charging happens per ACTION with fixed prices (chargeAction), not per token.
 */
export function recordAiUsage(_action: string, tokensUsed: number, _details?: string): void {
  if (!tokensUsed || tokensUsed <= 0) return;
  if (activeMeterTokens != null) activeMeterTokens += tokensUsed;
}

// ---------------------------------------------------------------------------
// Scan cost measurement — pricing model: 1 credit ≈ 1 scan.
// We MEASURE what a scan really costs in tokens, then the suggested ratio is
// 2× the measured average (safety reserve). Apply it via POST /api/credits/calibrate.
// ---------------------------------------------------------------------------

const SCAN_COUNT_KEY = "scanCount";
const SCAN_TOKENS_KEY = "scanTokensTotal";

/** Tokens collected while a scan is running (recordAiUsage feeds this). */
let activeMeterTokens: number | null = null;

export function beginScanMeter(): void {
  activeMeterTokens = 0;
}

/** Stop measuring, persist the scan's token cost, return it. */
export function endScanMeter(): number {
  const tokens = activeMeterTokens ?? 0;
  activeMeterTokens = null;
  if (tokens > 0) {
    const now = new Date().toISOString();
    const read = (key: string) => {
      const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      const n = row ? Number(row.value) : 0;
      return Number.isFinite(n) ? n : 0;
    };
    const write = (key: string, value: number) =>
      db.insert(appSettings)
        .values({ key, value: String(value), updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value), updatedAt: now } })
        .run();
    write(SCAN_COUNT_KEY, read(SCAN_COUNT_KEY) + 1);
    write(SCAN_TOKENS_KEY, read(SCAN_TOKENS_KEY) + tokens);
    console.log(`[credits] Scan measured: ${tokens} tokens`);
  }
  return tokens;
}

export interface ScanStats {
  scans: number;
  avgTokensPerScan: number;
  /** 2× the measured average — "1 credit buys one scan with reserve" */
  suggestedTokensPerCredit: number;
}

export function getScanStats(): ScanStats {
  const row = (key: string) => {
    const r = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    const n = r ? Number(r.value) : 0;
    return Number.isFinite(n) ? n : 0;
  };
  const scans = row(SCAN_COUNT_KEY);
  const total = row(SCAN_TOKENS_KEY);
  const avg = scans > 0 ? Math.round(total / scans) : 0;
  return { scans, avgTokensPerScan: avg, suggestedTokensPerCredit: avg * 2 };
}

/** Set the ratio to the suggested value (2× measured scan average). */
export function calibrateTokensPerCredit(): number {
  const { scans, suggestedTokensPerCredit } = getScanStats();
  if (scans === 0 || suggestedTokensPerCredit <= 0) {
    throw new Error("Zatiaľ nie je zmeraný žiadny sken — spusti aspoň jeden SCAN a skús znova");
  }
  setTokensPerCredit(suggestedTokensPerCredit);
  return suggestedTokensPerCredit;
}

/** Manual top-up (admin action for now; payment provider later). */
export function addCredits(amount: number, details?: string): void {
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("amount must be a non-zero number");
  }
  db.insert(creditLedger)
    .values({
      action: amount > 0 ? "topup" : "adjustment",
      tokensUsed: 0,
      creditsDelta: amount,
      details: details?.slice(0, 200) ?? null,
      timestamp: new Date().toISOString(),
    })
    .run();
}

export interface CreditSummary {
  balance: number;
  tokensPerCredit: number;
  actionPrices: ActionPrices;
  totalTokensUsed: number;
  totalCreditsSpent: number;
  scanStats: ScanStats;
  ledger: (typeof creditLedger.$inferSelect)[];
}

export function getCreditSummary(limit: number = 50): CreditSummary {
  ensureStarterGrant();
  const all = db.select().from(creditLedger).all();
  const balance = Math.round(all.reduce((a: number, r: { creditsDelta: number }) => a + r.creditsDelta, 0) * 1000) / 1000;
  const totalTokensUsed = all.reduce((a: number, r: { tokensUsed: number | null }) => a + (r.tokensUsed ?? 0), 0);
  const totalCreditsSpent =
    Math.round(
      all.filter((r: { creditsDelta: number }) => r.creditsDelta < 0)
         .reduce((a: number, r: { creditsDelta: number }) => a - r.creditsDelta, 0) * 1000,
    ) / 1000;
  const ledger = db
    .select()
    .from(creditLedger)
    .orderBy(desc(creditLedger.id))
    .limit(limit)
    .all();
  return { balance, tokensPerCredit: getTokensPerCredit(), actionPrices: getActionPrices(), totalTokensUsed, totalCreditsSpent, scanStats: getScanStats(), ledger };
}
