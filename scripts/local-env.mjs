import { existsSync } from 'node:fs';
export function loadLocalEnv() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
}
