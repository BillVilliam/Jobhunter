import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "/",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    warmup: {
      clientFiles: [
        "./client/index.html",
        "./client/src/main.tsx",
        "./client/src/App.tsx",
      ],
    },
  },
  // Pre-bundle the heaviest parts of the app so the first request after
  // `npm run dev` isn't blocked on a long esbuild dep-scan.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "wouter",
      "@tanstack/react-query",
      "framer-motion",
      "lucide-react",
      "date-fns",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-tabs",
      "@radix-ui/react-slot",
      "@radix-ui/react-label",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-switch",
      "@radix-ui/react-progress",
      "@radix-ui/react-alert-dialog",
    ],
  },
});
