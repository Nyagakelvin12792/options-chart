import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
