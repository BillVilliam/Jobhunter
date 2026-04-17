import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { insertCvVersionSchema, insertCoverLetterSchema, insertJobListingSchema, insertWatcherConfigSchema, insertApplicationLogSchema, insertUserProfileSchema } from "@shared/schema.js";
import { runWatcher, runAllActiveWatchers, type RunWatcherResult, type ScanProgressCallback } from "./scraper.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==================== CV Versions ====================
  app.get("/api/cv-versions", async (_req, res) => {
    const versions = await storage.getCvVersions();
    res.json(versions);
  });

  app.get("/api/cv-versions/:id", async (req, res) => {
    const cv = await storage.getCvVersion(Number(req.params.id));
    if (!cv) return res.status(404).json({ error: "CV not found" });
    res.json(cv);
  });

  app.post("/api/cv-versions", async (req, res) => {
    const parsed = insertCvVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("CV validation error:", parsed.error.issues);
      return res.status(400).json({ error: parsed.error.message });
    }
    const cv = await storage.createCvVersion(parsed.data);
    res.status(201).json(cv);
  });

  app.patch("/api/cv-versions/:id", async (req, res) => {
    const cv = await storage.updateCvVersion(Number(req.params.id), req.body);
    if (!cv) return res.status(404).json({ error: "CV not found" });
    res.json(cv);
  });

  app.delete("/api/cv-versions/:id", async (req, res) => {
    await storage.deleteCvVersion(Number(req.params.id));
    res.status(204).send();
  });

  // Parse CV PDF → plain text
  app.post("/api/cv-versions/:id/parse", async (req, res) => {
    try {
      const cv = await storage.getCvVersion(Number(req.params.id));
      if (!cv) return res.status(404).json({ error: "CV not found" });

      if (cv.fileType !== "pdf") {
        return res.status(400).json({ error: "Momentálne podporujeme iba PDF súbory" });
      }

      const pdfModule = await import("pdf-parse");
      const pdfParse = (pdfModule as any).default ?? pdfModule;
      const buffer = Buffer.from(cv.fileContent, "base64");
      const data = await pdfParse(buffer);
      const parsedText = data.text.trim();

      // Save parsed text to DB
      const updated = await storage.updateCvVersion(cv.id, { parsedText });

      res.json({ parsedText, pages: data.numpages });
    } catch (e: any) {
      console.error("PDF parse error:", e);
      res.status(500).json({ error: "Nepodarilo sa prečítať PDF: " + e.message });
    }
  });

  // ==================== Cover Letters ====================
  app.get("/api/cover-letters", async (_req, res) => {
    const letters = await storage.getCoverLetters();
    res.json(letters);
  });

  app.get("/api/cover-letters/:id", async (req, res) => {
    const cl = await storage.getCoverLetter(Number(req.params.id));
    if (!cl) return res.status(404).json({ error: "Cover letter not found" });
    res.json(cl);
  });

  app.post("/api/cover-letters", async (req, res) => {
    const parsed = insertCoverLetterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const cl = await storage.createCoverLetter(parsed.data);
    res.status(201).json(cl);
  });

  app.patch("/api/cover-letters/:id", async (req, res) => {
    const cl = await storage.updateCoverLetter(Number(req.params.id), req.body);
    if (!cl) return res.status(404).json({ error: "Cover letter not found" });
    res.json(cl);
  });

  app.delete("/api/cover-letters/:id", async (req, res) => {
    await storage.deleteCoverLetter(Number(req.params.id));
    res.status(204).send();
  });

  // ==================== Job Listings ====================
  app.get("/api/jobs", async (req, res) => {
    const filters: { status?: string; portal?: string; minScore?: number; limit?: number } = {};
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.portal) filters.portal = req.query.portal as string;
    // Default: show only 60%+ jobs, max 50
    filters.minScore = req.query.minScore ? Number(req.query.minScore) : 60;
    filters.limit = req.query.limit ? Number(req.query.limit) : 50;
    const jobs = await storage.getJobListings(filters);
    res.json(jobs);
  });

  app.get("/api/jobs/stats", async (_req, res) => {
    const stats = await storage.getJobStats();
    res.json(stats);
  });

  app.delete("/api/jobs/clear", async (_req, res) => {
    const deleted = await storage.clearUnprotectedJobs();
    res.json({ deleted });
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getJobListing(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  app.post("/api/jobs", async (req, res) => {
    const parsed = insertJobListingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const job = await storage.createJobListing(parsed.data);
    res.status(201).json(job);
  });

  app.patch("/api/jobs/:id", async (req, res) => {
    const updates = { ...req.body };
    // Auto-set appliedAt when marking as applied
    if (updates.status === "applied" && !updates.appliedAt) {
      updates.appliedAt = new Date().toISOString();
    }
    // Clear appliedAt when un-applying
    if (updates.status && updates.status !== "applied") {
      updates.appliedAt = null;
    }
    const job = await storage.updateJobListing(Number(req.params.id), updates);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  // ==================== Watcher Configs ====================
  app.get("/api/watchers", async (_req, res) => {
    const watchers = await storage.getWatcherConfigs();
    res.json(watchers);
  });

  app.get("/api/watchers/:id", async (req, res) => {
    const watcher = await storage.getWatcherConfig(Number(req.params.id));
    if (!watcher) return res.status(404).json({ error: "Watcher not found" });
    res.json(watcher);
  });

  app.post("/api/watchers", async (req, res) => {
    const parsed = insertWatcherConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const watcher = await storage.createWatcherConfig(parsed.data);
    res.status(201).json(watcher);
  });

  app.patch("/api/watchers/:id", async (req, res) => {
    const watcher = await storage.updateWatcherConfig(Number(req.params.id), req.body);
    if (!watcher) return res.status(404).json({ error: "Watcher not found" });
    res.json(watcher);
  });

  app.delete("/api/watchers/:id", async (req, res) => {
    await storage.deleteWatcherConfig(Number(req.params.id));
    res.status(204).send();
  });

  // Manually trigger a watcher run (scrape + AI analysis)
  app.post("/api/watchers/:id/run", async (req, res) => {
    const id = Number(req.params.id);
    const watcher = await storage.getWatcherConfig(id);
    if (!watcher) return res.status(404).json({ error: "Watcher not found" });
    try {
      const result = await runWatcher(id);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ==================== Application Logs ====================
  app.get("/api/logs", async (req, res) => {
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const logs = await storage.getApplicationLogs(jobId);
    res.json(logs);
  });

  app.post("/api/logs", async (req, res) => {
    const parsed = insertApplicationLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const log = await storage.createApplicationLog(parsed.data);
    res.status(201).json(log);
  });

  // ==================== User Profiles ====================
  app.get("/api/profiles", async (_req, res) => {
    const profiles = await storage.getProfiles();
    res.json(profiles);
  });

  app.get("/api/profiles/:id", async (req, res) => {
    const profile = await storage.getProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  });

  app.post("/api/profiles", async (req, res) => {
    const parsed = insertUserProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const profile = await storage.createProfile(parsed.data);
    res.status(201).json(profile);
  });

  app.patch("/api/profiles/:id", async (req, res) => {
    const profile = await storage.updateProfile(Number(req.params.id), req.body);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  });

  app.delete("/api/profiles/:id", async (req, res) => {
    await storage.deleteProfile(Number(req.params.id));
    res.status(204).send();
  });

  // ==================== Dashboard Stats ====================
  app.get("/api/dashboard", async (_req, res) => {
    const stats = await storage.getJobStats();
    const recentJobs = await storage.getJobListings();
    const cvCount = (await storage.getCvVersions()).length;
    const allWatchers = await storage.getWatcherConfigs();
    const watcherCount = allWatchers.filter(w => w.isActive).length;
    res.json({
      stats,
      recentJobs: recentJobs.slice(0, 10),
      cvCount,
      activeWatchers: watcherCount,
      totalWatchers: allWatchers.length,
    });
  });

  // ==================== Scan – run ALL active watchers (SSE streaming) ====================
  // Active scan abort controller
  let activeScanAbort: AbortController | null = null;

  app.post("/api/scan/cancel", (_req, res) => {
    if (activeScanAbort) {
      activeScanAbort.abort();
      activeScanAbort = null;
      res.json({ cancelled: true });
    } else {
      res.json({ cancelled: false, message: "No active scan" });
    }
  });

  app.post("/api/scan", async (req, res) => {
    // Check if client wants SSE streaming
    const wantsSSE = req.headers.accept === "text/event-stream";

    if (wantsSSE) {
      // SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (data: Record<string, unknown>) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Create abort controller for this scan
      const abortController = new AbortController();
      activeScanAbort = abortController;

      console.log("[scan] Starting SSE scan...");

      try {
        const allWatchers = await storage.getWatcherConfigs();
        const active = allWatchers.filter(w => w.isActive);
        if (active.length === 0) {
          sendEvent({ type: "done", totalFound: 0, totalSaved: 0, results: [], message: "Žiadne aktívne watchery" });
          res.end();
          activeScanAbort = null;
          return;
        }

        const results: { watcherId: number; watcherName: string; result: RunWatcherResult }[] = [];
        let totalFound = 0;
        let totalSaved = 0;
        let totalNewJobs = 0;

        for (const w of active) {
          if (abortController.signal.aborted) break;

          let watcherNewJobs = 0;
          const onProgress: ScanProgressCallback = (progress) => {
            watcherNewJobs = progress.newJobs;
            sendEvent({
              type: "progress",
              watcherName: w.name,
              ...progress,
              totalFound: totalFound + progress.found,
              totalNewJobs: totalNewJobs + progress.newJobs,
              totalSaved: totalSaved + progress.saved,
            });
          };

          const result = await runWatcher(w.id, onProgress, abortController.signal);
          results.push({ watcherId: w.id, watcherName: w.name, result });
          totalFound += result.found;
          totalSaved += result.saved;
          totalNewJobs += watcherNewJobs;
        }

        sendEvent({ type: abortController.signal.aborted ? "cancelled" : "done", totalFound, totalSaved, results });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        sendEvent({ type: "error", error: message });
      }
      activeScanAbort = null;
      if (!res.writableEnded) res.end();
    } else {
      // Fallback: regular JSON response
      try {
        const allWatchers = await storage.getWatcherConfigs();
        const active = allWatchers.filter(w => w.isActive);
        if (active.length === 0) {
          return res.json({ totalFound: 0, totalSaved: 0, results: [], message: "Žiadne aktívne watchery" });
        }
        const results: { watcherId: number; watcherName: string; result: RunWatcherResult }[] = [];
        let totalFound = 0;
        let totalSaved = 0;
        for (const w of active) {
          const result = await runWatcher(w.id);
          results.push({ watcherId: w.id, watcherName: w.name, result });
          totalFound += result.found;
          totalSaved += result.saved;
        }
        res.json({ totalFound, totalSaved, results });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    }
  });

  return httpServer;
}
