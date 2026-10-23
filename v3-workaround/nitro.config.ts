import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "server",
  preset: "cloudflare_module",
  compatibilityDate: "2025-07-16",
  // Restores Nitro v2's behaviour: node_modules are side-effect free
  rolldownConfig: {
    treeshake: { moduleSideEffects: (id: string) => !id.includes("/node_modules/") },
  },
});
