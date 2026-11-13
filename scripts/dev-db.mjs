import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const dataDir = path.resolve(process.cwd(), '.pgdata', 'main');
const pidFile = path.resolve(process.cwd(), '.pgdata', 'server.pid');
const PORT = Number(process.env.MB_DEV_PG_PORT || 5433);
const USER = 'mi_balance';
const PASSWORD = 'mi_balance';
const DB = 'mi_balance';

async function startServer() {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(DB);
  } catch {
    /* ya existe */
  }
  fs.writeFileSync(pidFile, String(process.pid));
  const shutdown = async () => {
    try {
      await pg.stop();
    } catch {
      /* noop */
    }
    fs.rmSync(pidFile, { force: true });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`[dev-db] PostgreSQL listo en puerto ${PORT} (usuario ${USER}, base ${DB})`);
  setInterval(() => {}, 1 << 30);
}

const cmd = process.argv[2];
if (cmd === 'up') {
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid, 0);
      console.log(`[dev-db] ya está corriendo (pid ${pid})`);
      process.exit(0);
    } catch {
      fs.rmSync(pidFile, { force: true });
    }
  }
  if (process.argv.includes('--fg')) {
    startServer().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  } else {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'up', '--fg'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log(`[dev-db] iniciando PostgreSQL embebido en segundo plano (puerto ${PORT})...`);
  }
} else if (cmd === 'down') {
  if (!fs.existsSync(pidFile)) {
    console.log('[dev-db] no está corriendo');
  } else {
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[dev-db] detenido (pid ${pid})`);
    } catch {
      /* noop */
    }
    fs.rmSync(pidFile, { force: true });
  }
} else {
  console.log('uso: node scripts/dev-db.mjs [up|down] [--fg]');
}
