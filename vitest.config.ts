import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/index.ts"],
    },
  },
});
