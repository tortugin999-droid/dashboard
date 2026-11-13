import { writeFileSync } from 'node:fs';
import { createApp, setupSwagger } from '../src/main';

async function main() {
  const app = await createApp();
  const document = setupSwagger(app);
  writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  await app.close();
  console.log('openapi.json generado');
}

void main();
