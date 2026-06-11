/**
 * Central AI clients.
 *
 * - DeepSeek V4 Pro (OpenAI-compatible API) does ALL text reasoning:
 *   job analysis/scoring, CV profile analysis, watcher suggestions,
 *   cover letters.
 * - OpenAI gpt-4.1-mini is kept ONLY for vision (CV image → text),
 *   because the DeepSeek API does not accept image input.
 *
 * NOTE: deepseek-v4-pro is a reasoning model — it spends part of
 * max_tokens on internal reasoning before answering, so callers must
 * use generous max_tokens budgets or the answer gets truncated.
 */

import type OpenAIType from "openai";

export const DEEPSEEK_MODEL = "deepseek-v4-pro";
export const VISION_MODEL = "gpt-4.1-mini";

let _deepseek: OpenAIType | null = null;
let _vision: OpenAIType | null = null;

/** DeepSeek V4 Pro — all text reasoning */
export async function getDeepSeek(): Promise<OpenAIType> {
  if (!_deepseek) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey)
      throw new Error("DEEPSEEK_API_KEY environment variable is not set");
    const { default: OpenAI } = await import("openai");
    _deepseek = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  }
  return _deepseek;
}

/** OpenAI — vision only (CV image OCR) */
export async function getVisionAI(): Promise<OpenAIType> {
  if (!_vision) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new Error("OPENAI_API_KEY environment variable is not set");
    const { default: OpenAI } = await import("openai");
    _vision = new OpenAI({ apiKey });
  }
  return _vision;
}
