export default async function globalTeardown(): Promise<void> {
  const pg = (globalThis as Record<string, unknown>).__MB_E2E_PG__ as
    | { stop: () => Promise<void> }
    | undefined;
  if (pg) {
    await pg.stop();
  }
}
