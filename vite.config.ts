import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

import pkg from "./package.json" with { type: "json" };
import { virtualRouteConfig } from "./src/routes.config";

const config = defineConfig({
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({ router: { virtualRouteConfig } }),
    // job scheduler
    nitro({ plugins: ["./src/app/server/jobs/startup.ts"] }),
    react(),
  ],
});

export default config;
