import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage.js";
import { insertCvVersionSchema, insertCoverLetterSchema, insertJobListingSchema, insertWatcherConfigSchema, insertApplicationLogSchema, insertUserProfileSchema } from "@shared/schema.js";
import type { RunWatcherResult, ScanProgressCallback } from "./scraper.js";

// Heavy modules (cheerio, openai pulled in by scraper) load lazily on first
// use so they don't slow down `npm run dev` startup.
let scraperPromise: Promise<typeof import("./scraper.js")> | null = null;
const loadScraper = () =>
  (scraperPromise ??= import("./scraper.js"));

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==================== CV Versions ====================
  app.get("/api/cv-versions", async (req, res) => {
    const versions = await storage.getCvVersions();
    const includeContent = req.query.includeContent === "1" || req.query.includeContent === "true";

    // By default, return lightweight metadata only (avoid sending huge base64 blobs).
    if (!includeContent) {
      const lightweight = versions.map((v) => ({
        ...v,
        fileContent: "",
        imageContent: null,
      }));
      return res.json(lightweight);
    }

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

  // Analyze CV image → full profile via OpenAI Vision
  app.post("/api/cv-versions/:id/analyze", async (req, res) => {
    try {
      const cv = await storage.getCvVersion(Number(req.params.id));
      if (!cv) return res.status(404).json({ error: "CV not found" });

      if (!cv.fileContent) {
        return res.status(400).json({ error: "CV nemá nahraný súbor" });
      }

      const imageUrl = cv.fileContent.startsWith("data:")
        ? cv.fileContent
        : `data:image/png;base64,${cv.fileContent}`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a CV/resume analyst. Analyze the CV image and return a JSON object with:
{
  "name": "suggested CV name based on the person's role/focus",
  "fullName": "person's full name",
  "targetRole": "primary target role/position",
  "location": "city, country where the person is based",
  "skills": ["skill1", "skill2", ...],
  "languages": [{"language": "English", "level": "B2"}, ...],
  "experience": [{"role": "title", "company": "name", "duration": "period", "description": "brief"}],
  "education": [{"degree": "title", "school": "name", "year": "year"}],
  "summary": "2-3 sentence professional summary",
  "suggestedCategories": [
    {"value": "unique-id", "label": "Category Name", "emoji": "🔍", "terms": ["search term 1", "search term 2"]}
  ],
  "suggestedSearchTerms": ["term1", "term2", ...],
  "cvLanguage": "sk" or "cs" or "en",
  "parsedText": "full extracted text from the CV"
}

For suggestedCategories: analyze the person's skills and experience, then suggest 5-8 job search categories that would be the BEST match. Each category should have relevant search terms in Czech/Slovak (for Czech/Slovak job portals). Think about what positions typically need this person's skillset.

For suggestedSearchTerms: provide 10-15 concrete job search keywords in Czech/Slovak.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this CV image completely. Extract all information and suggest matching job categories.",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl, detail: "high" },
              },
            ],
          },
        ],
      });

      const analysisText = response.choices[0]?.message?.content || "{}";
      let analysis: Record<string, unknown>;
      try {
        analysis = JSON.parse(analysisText);
      } catch {
        analysis = { error: "Failed to parse AI response", raw: analysisText };
      }

      // Auto-fill CV fields from analysis
      const updates: Record<string, unknown> = {
        cvAnalysis: JSON.stringify(analysis),
        parsedText: (analysis.parsedText as string) || "",
      };
      if (analysis.name) updates.name = analysis.name;
      if (analysis.targetRole) updates.targetRole = analysis.targetRole;
      if (analysis.skills && Array.isArray(analysis.skills)) updates.skills = JSON.stringify(analysis.skills);
      if (analysis.cvLanguage) updates.language = analysis.cvLanguage;
      if (analysis.summary) updates.description = analysis.summary;

      await storage.updateCvVersion(cv.id, updates);

      res.json({ analysis, cvId: cv.id });
    } catch (e: any) {
      console.error("CV analyze error:", e);
      res.status(500).json({ error: "Nepodarilo sa analyzovať CV: " + e.message });
    }
  });

  // Get suggested categories from a CV analysis (for watchers)
  app.get("/api/cv-versions/:id/categories", async (req, res) => {
    const cv = await storage.getCvVersion(Number(req.params.id));
    if (!cv) return res.status(404).json({ error: "CV not found" });
    try {
      const analysis = JSON.parse((cv as any).cvAnalysis || "{}");
      res.json({
        suggestedCategories: analysis.suggestedCategories || [],
        suggestedSearchTerms: analysis.suggestedSearchTerms || [],
      });
    } catch {
      res.json({ suggestedCategories: [], suggestedSearchTerms: [] });
    }
  });

  // ==================== Cover Letters ====================
  app.get("/api/cover-letters", async (_req, res) => {
    const letters = await storage.getCoverLetters();
    res.json(letters);
  });

  // Generate cover letter via AI (CV + favorite job)
  app.post("/api/cover-letters/generate", async (req, res) => {
    try {
      const { cvId, jobId, language, lengthType, lengthValue } = req.body as {
        cvId: number;
        jobId: number;
        language: string;       // cs, sk, en
        lengthType: string;     // "words" | "chars"
        lengthValue: number;    // e.g. 300
      };

      const cv = await storage.getCvVersion(cvId);
      if (!cv) return res.status(404).json({ error: "CV not found" });
      const job = await storage.getJobListing(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });

      // Parse CV analysis for rich context
      let cvContext = "";
      try {
        const analysis = JSON.parse((cv as any).cvAnalysis || "{}");
        cvContext = [
          analysis.fullName ? `Meno: ${analysis.fullName}` : "",
          analysis.targetRole ? `Cieľová pozícia: ${analysis.targetRole}` : "",
          analysis.location ? `Lokácia: ${analysis.location}` : "",
          analysis.summary ? `Profil: ${analysis.summary}` : "",
          analysis.skills?.length ? `Skills: ${analysis.skills.join(", ")}` : "",
          analysis.languages?.length ? `Jazyky: ${analysis.languages.map((l: any) => `${l.language} (${l.level})`).join(", ")}` : "",
          analysis.experience?.length ? `Skúsenosti:\n${analysis.experience.map((e: any) => `- ${e.role} @ ${e.company} (${e.duration}): ${e.description}`).join("\n")}` : "",
          analysis.education?.length ? `Vzdelanie: ${analysis.education.map((e: any) => `${e.degree} – ${e.school} (${e.year})`).join(", ")}` : "",
        ].filter(Boolean).join("\n");
      } catch {
        cvContext = cv.parsedText || cv.description || "No CV data available";
      }

      const langMap: Record<string, string> = { cs: "Czech", sk: "Slovak", en: "English" };
      const langName = langMap[language] || "Czech";
      const lengthInstruction = lengthType === "words"
        ? `approximately ${lengthValue} words`
        : `approximately ${lengthValue} characters`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: 3000,
        messages: [
          {
            role: "system",
            content: `You are a professional cover letter writer. Write a cover letter (motivačný list) in ${langName}.

RULES:
- Write in a natural, human tone – not robotic or generic. It should sound like a real person wrote it.
- The letter should be ${lengthInstruction} long.
- Tailor the letter specifically to the company and position described.
- Reference the candidate's relevant skills, experience, and strengths from their CV.
- Show genuine interest in the specific company and role.
- Do NOT start with "Vážený pán/pani" if it's too formal – use a modern, professional but warm opening.
- Do NOT use clichés like "I am a hard worker" or "I am a team player" without context.
- Include concrete examples from the CV that relate to the job requirements.
- End with a clear call to action.
- Return ONLY the letter text, no extra commentary or formatting instructions.`
          },
          {
            role: "user",
            content: `Write a cover letter based on this information:

=== CANDIDATE (from CV) ===
${cvContext}

=== JOB POSITION ===
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "Not specified"}
Description: ${job.description || "Not available"}
Requirements: ${job.requirements || "Not specified"}
Salary: ${job.salary || "Not specified"}
Portal: ${job.portal}

Please write the cover letter in ${langName}, ${lengthInstruction}.`
          },
        ],
      });

      const generatedText = response.choices[0]?.message?.content || "";
      res.json({
        content: generatedText,
        cvName: cv.name,
        jobTitle: job.title,
        company: job.company,
      });
    } catch (e: any) {
      console.error("Cover letter generate error:", e);
      res.status(500).json({ error: "Nepodarilo sa vygenerovať motivačný list: " + e.message });
    }
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
    const filters: { status?: string; portal?: string; minScore?: number; limit?: number; favorite?: boolean } = {};
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.portal) filters.portal = req.query.portal as string;
    if (req.query.favorite != null) {
      const fav = String(req.query.favorite).toLowerCase();
      filters.favorite = fav === "1" || fav === "true";
    }
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
      const { runWatcher } = await loadScraper();
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
        const { runWatcher } = await loadScraper();
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
        const { runWatcher } = await loadScraper();
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
