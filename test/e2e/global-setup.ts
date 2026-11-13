import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
const EmbeddedPostgres = (require('embedded-postgres').default ?? require('embedded-postgres')) as any;

const PORT = 5434;
const DATA_DIR = path.resolve(__dirname, '..', '..', '.pgdata', 'test');
const ENV_FILE = path.resolve(__dirname, '..', '..', '.pgdata', 'e2e-env.json');

export default async function globalSetup(): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'mb_test',
    password: 'mb_test',
    port: PORT,
    persistent: false,
  });
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('mi_balance_test');
  } catch {
    /* ya existe */
  }
  const databaseUrl = `postgresql://mb_test:mb_test@localhost:${PORT}/mi_balance_test?schema=public`;
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  fs.writeFileSync(ENV_FILE, JSON.stringify({ databaseUrl }));
  (globalThis as Record<string, unknown>).__MB_E2E_PG__ = pg;
}
