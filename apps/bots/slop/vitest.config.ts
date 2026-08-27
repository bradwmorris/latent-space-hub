import { defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    // Keep the standalone bot tests isolated from the Hub app's PostCSS config.
    postcss: { plugins: [] },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
