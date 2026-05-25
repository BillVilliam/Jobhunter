import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const sanitizeForLog = (value: unknown): unknown => {
    if (value == null) return value;

    if (typeof value === "string") {
      if (value.length > 300) {
        return `[string:${value.length} chars] ${value.slice(0, 120)}...`;
      }
      return value;
    }

    if (Array.isArray(value)) {
      if (value.length > 8) {
        return [
          ...value.slice(0, 3).map(sanitizeForLog),
          `...[+${value.length - 3} more items]`,
        ];
      }
      return value.map(sanitizeForLog);
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (
          k === "fileContent" ||
          k === "imageContent" ||
          k === "cvAnalysis" ||
          k === "parsedText"
        ) {
          out[k] = typeof v === "string" ? `[omitted:${v.length} chars]` : "[omitted]";
          continue;
        }
        out[k] = sanitizeForLog(v);
      }
      return out;
    }

    return value;
  };

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const safePayload = sanitizeForLog(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(safePayload)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const bootStart = Date.now();
  log("registering API routes…");
  await registerRoutes(httpServer, app);
  log(`API routes ready (${Date.now() - bootStart}ms)`);

  const port = parseInt(process.env.PORT || "3000", 10);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on http://localhost:${port}`);
    });
    return;
  }

  // ----- development: bind the port FIRST, then attach Vite in background -----
  // This way `npm run dev` shows "serving on …" within a second instead of
  // sitting silent for ~30-60s while Vite pre-bundles deps on the first run.
  let viteReady = false;
  app.use((req, res, next) => {
    if (viteReady) return next();
    if (req.path.startsWith("/api")) {
      return res.status(503).json({ error: "Dev server is still starting, try again in a moment" });
    }
    if (req.headers.accept?.includes("text/html")) {
      return res
        .status(200)
        .set("Content-Type", "text/html")
        .end(`<!DOCTYPE html><html><head><title>Loading…</title><meta http-equiv="refresh" content="2"></head><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0b;color:#eee"><div style="text-align:center"><h2>⚡ Vite dev server is starting…</h2><p style="opacity:.6">This page will auto-refresh.</p></div></body></html>`);
    }
    next();
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  httpServer.listen(port, "0.0.0.0", async () => {
    log(`serving on http://localhost:${port} (${Date.now() - bootStart}ms)`);
    log("booting Vite dev server in background — first run may pre-bundle deps…");
    try {
      const viteStart = Date.now();
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      viteReady = true;
      log(`Vite ready in ${Date.now() - viteStart}ms — open http://localhost:${port}`);
    } catch (err) {
      console.error("[vite] failed to initialize:", err);
    }
  });
})();
