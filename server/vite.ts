import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import fs from "fs";
import path from "path";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const { default: viteConfig } = await import("../vite.config");

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "wouter",
        "wouter/use-hash-location",
        "@tanstack/react-query",
        "lucide-react",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
        "@radix-ui/react-slot",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-select",
        "@radix-ui/react-tabs",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-toast",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-label",
        "@radix-ui/react-separator",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-toggle",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-avatar",
        "@radix-ui/react-popover",
        "@radix-ui/react-accordion",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-context-menu",
        "@radix-ui/react-progress",
        "@radix-ui/react-radio-group",
        "@radix-ui/react-switch",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-aspect-ratio",
        "@radix-ui/react-slider",
        "@radix-ui/react-menubar",
        "@radix-ui/react-navigation-menu",
        "react-hook-form",
        "embla-carousel-react",
        "recharts",
        "cmdk",
        "vaul",
        "input-otp",
        "react-resizable-panels",
        "react-day-picker",
      ],
    },
    server: {
      ...serverOptions,
      warmup: {
        clientFiles: [
          "src/main.tsx",
          "src/App.tsx",
          "src/pages/dashboard.tsx",
          "src/components/layout.tsx",
          "src/components/app-sidebar.tsx",
        ],
      },
    },
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Only serve index.html for non-API, non-asset routes (SPA fallback)
  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes, HMR, and anything with a file extension (let Vite handle those)
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
