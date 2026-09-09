import { defineConfig } from "vitest/config";
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)), '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
