/**
 * Global scan state store.
 *
 * Lives outside React so the running fetch is never lost when
 * the Dashboard component unmounts / re-mounts during navigation.
 *
 * Uses SSE (Server-Sent Events) for live progress updates.
 *
 * Components subscribe with `useScanStore()` (re-renders on change).
 */

import { useSyncExternalStore } from "react";
import { queryClient } from "./queryClient";

// ── Types ──────────────────────────────────────────────────────────

export interface ScanResultItem {
  watcherId: number;
  watcherName: string;
  result: {
    found: number;
    saved: number;
    skippedDuplicates: number;
    skippedLowScore: number;
    errors: string[];
  };
}

export interface ScanResult {
  totalFound: number;
  totalSaved: number;
  results: ScanResultItem[];
  message?: string;
  error?: string;
}

export interface ScanProgress {
  phase: "scraping" | "analyzing";
  watcherName?: string;
  found: number;
  newJobs: number;
  analyzed: number;
  total: number;
  saved: number;
  totalFound: number;
  totalNewJobs: number;
  totalSaved: number;
}

export interface ScanState {
  isPending: boolean;
  seconds: number;
  result: ScanResult | null;
  error: string | null;
  showDollarRain: boolean;
  progress: ScanProgress | null;
}

// ── Module-level singleton ─────────────────────────────────────────

let state: ScanState = {
  isPending: false,
  seconds: 0,
  result: null,
  error: null,
  showDollarRain: false,
  progress: null,
};

let timer: ReturnType<typeof setInterval> | null = null;
let abortController: AbortController | null = null;

const listeners = new Set<() => void>();

function emit() {
  // Create a new object reference so React detects the change
  state = { ...state };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ScanState {
  return state;
}

// ── Actions ────────────────────────────────────────────────────────

export function startScan() {
  if (state.isPending) return; // already running

  state.isPending = true;
  state.seconds = 0;
  state.result = null;
  state.error = null;
  state.showDollarRain = false;
  state.progress = null;
  emit();

  // Tick every second
  timer = setInterval(() => {
    state.seconds += 1;
    emit();
  }, 1000);

  // Use SSE for live progress
  abortController = new AbortController();
  fetch("/api/scan", {
    method: "POST",
    headers: {
      "Accept": "text/event-stream",
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: abortController.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "progress") {
              if (!state.isPending) continue; // already stopped
              state.progress = {
                phase: event.phase,
                watcherName: event.watcherName,
                found: event.found,
                newJobs: event.newJobs ?? 0,
                analyzed: event.analyzed,
                total: event.total,
                saved: event.saved,
                totalFound: event.totalFound,
                totalNewJobs: event.totalNewJobs ?? 0,
                totalSaved: event.totalSaved,
              };
              emit();
            } else if (event.type === "done" || event.type === "cancelled") {
              if (!state.isPending) continue; // already handled by stopScan
              state.isPending = false;
              state.progress = null;
              state.result = {
                totalFound: event.totalFound,
                totalSaved: event.totalSaved,
                results: event.results,
                message: event.type === "cancelled" ? "Scan zastavený" : undefined,
              };
              if (timer) clearInterval(timer);
              timer = null;
              abortController = null;

              queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });

              if (!event.error && event.type !== "cancelled") {
                state.showDollarRain = true;
                emit();
                setTimeout(() => {
                  state.showDollarRain = false;
                  emit();
                }, 4000);
              } else {
                emit();
              }
            } else if (event.type === "error") {
              state.isPending = false;
              state.progress = null;
              state.error = event.error;
              if (timer) clearInterval(timer);
              timer = null;
              emit();
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // If stream ended without a "done" event, mark as complete
      if (state.isPending) {
        state.isPending = false;
        state.progress = null;
        state.result = {
          totalFound: 0,
          totalSaved: 0,
          results: [],
        };
        if (timer) clearInterval(timer);
        timer = null;
        abortController = null;
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        emit();
      }
    })
    .catch((err) => {
      // If already handled (e.g. by stopScan), skip
      if (!state.isPending) return;

      // If aborted, just clean up
      if (err instanceof DOMException && err.name === "AbortError") {
        state.isPending = false;
        state.progress = null;
        if (timer) clearInterval(timer);
        timer = null;
        abortController = null;
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        emit();
        return;
      }
      state.isPending = false;
      state.progress = null;
      state.error = String(err);
      if (timer) clearInterval(timer);
      timer = null;
      abortController = null;
      emit();
    });
}

export function stopScan() {
  if (!state.isPending) return;

  // Set result immediately so UI shows feedback
  state.isPending = false;
  state.result = {
    totalFound: state.progress?.totalFound ?? 0,
    totalSaved: state.progress?.totalSaved ?? 0,
    results: [],
    message: "Scan zastavený",
  };
  state.progress = null;
  if (timer) clearInterval(timer);
  timer = null;

  queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
  emit();

  // Tell the server to cancel
  fetch("/api/scan/cancel", { method: "POST" }).catch(() => {});
  // Abort the client-side fetch (the catch handler will see isPending=false and skip)
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

// ── React hook ─────────────────────────────────────────────────────

export function useScanStore(): ScanState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
