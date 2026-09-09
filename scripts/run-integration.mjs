import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from './local-env.mjs';
loadLocalEnv();
// Never point integration fixtures at the application database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || testUrl === process.env.DATABASE_URL || !new URL(testUrl).pathname.endsWith('_test') || !process.env.TEST_RUNTIME_DATABASE_URL || new URL(process.env.TEST_RUNTIME_DATABASE_URL).pathname !== new URL(testUrl).pathname) {
  console.error("Integration tests require a separate TEST_DATABASE_URL. No database was contacted.");
  process.exit(1);
}
const directory = fileURLToPath(new URL("../tests/integration/", import.meta.url));
if (!existsSync(directory) || !readdirSync(directory, { recursive: true }).some((name) => String(name).endsWith(".test.ts"))) {
  console.error("Database integration tests require the dedicated test database. No passing result is claimed.");
  process.exit(1);
}
const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
process.env.DATABASE_URL = process.env.TEST_RUNTIME_DATABASE_URL;
const result = spawnSync(process.execPath, [vitest, "run", "--config", "vitest.integration.config.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
