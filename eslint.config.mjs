import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "work/**", "outputs/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { "patterns": [{ "group": ["@/server/*"], "message": "UI components must not import server-only services." }] }],
    },
  },
]);
