import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/web/**/*.test.ts",
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["tests/live/**"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/index.ts"],
    },
  },
});
