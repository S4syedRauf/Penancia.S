import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadConfigFromFile } from 'vite';

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));

function applicationSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return applicationSourceFiles(entryPath);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')
      ? [entryPath]
      : [];
  });
}

test('application code never replaces browser fetch with an in-browser API simulator', () => {
  const overridingFiles = applicationSourceFiles(sourceRoot).filter((file) =>
    /window\.fetch\s*=/.test(readFileSync(file, 'utf8')),
  );

  assert.deepEqual(
    overridingFiles.map((file) => path.relative(sourceRoot, file)),
    [],
    'API requests must reach the configured backend instead of being synthesized in the browser',
  );
});

test('development file watching ignores backend persistence and runtime artifacts', async () => {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    path.resolve(sourceRoot, '../vite.config.ts'),
  );
  assert.ok(loaded, 'Vite configuration must load');
  const watch = loaded.config.server?.watch as { ignored?: string[] } | null | undefined;

  assert.ok(watch, 'Vite watch options must be configured');
  assert.ok(watch.ignored?.includes('**/.panacea-data/**'));
  assert.ok(watch.ignored?.includes('**/test-artifacts/**'));
});

