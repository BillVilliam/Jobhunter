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
 * Record AI token usage and deduct the corresponding credits.
 * Call after every AI API response (usage.total_tokens).
 */
export function recordAiUsage(action: string, tokensUsed: number, details?: string): void {
  if (!tokensUsed || tokensUsed <= 0) return;
  const creditsDelta = -(tokensUsed / getTokensPerCredit());
  db.insert(creditLedger)
    .values({
      action,
      tokensUsed,
      creditsDelta,
      details: details?.slice(0, 200) ?? null,
      timestamp: new Date().toISOString(),
    })
    .run();
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
  totalTokensUsed: number;
  totalCreditsSpent: number;
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
  return { balance, tokensPerCredit: getTokensPerCredit(), totalTokensUsed, totalCreditsSpent, ledger };
}
