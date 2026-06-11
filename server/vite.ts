import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import fs from "fs";
import path from "path";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const { default: viteConfig } = await import("../vite.config");

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: {
      middlewareMode: true,
      hmr: { server, path: "/vite-hmr" },
      allowedHosts: true as const,
    },
    customLogger: viteLogger,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Only serve index.html for non-API, non-asset routes (SPA fallback)
  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    if (
      url.startsWith("/api") ||
      url.startsWith("/vite-hmr") ||
      url.startsWith("/@") ||
      url.startsWith("/node_modules") ||
      url.startsWith("/src") ||
      url.includes(".")
    ) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
