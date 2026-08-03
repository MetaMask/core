/**
 * Bundles the file-backed mock escrow server into a portable folder + zip.
 *
 * Testers only need Node.js — no git checkout, no yarn install.
 *
 * Usage (from this package):
 *   yarn mock-server:pack
 *
 * Or from the extension (sibling `../core`):
 *   yarn secret-escrow:mock-server:pack
 *
 * Output:
 *   mock-server/portable/server.mjs
 *   mock-server/portable/README.md
 *   mock-server/portable/start.sh / start.command / start.bat
 *   mock-server/secret-escrow-mock-server.zip
 */

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const outDir = join(here, 'portable');
const zipPath = join(here, 'secret-escrow-mock-server.zip');
const entryPoint = join(here, 'server.ts');

/**
 * Resolves an esbuild module path from known locations.
 *
 * @returns Absolute path to the esbuild package root.
 */
function resolveEsbuildPackage() {
  const candidates = [
    // Sibling MetaMask extension install (common local layout).
    resolve(
      packageRoot,
      '../../../metamask-extension/node_modules/esbuild',
    ),
    // This package / workspace node_modules.
    (() => {
      try {
        return dirname(require.resolve('esbuild/package.json'));
      } catch {
        return null;
      }
    })(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'lib/main.js'))) {
      return candidate;
    }
  }

  throw new Error(
    [
      'esbuild not found. Install it in the extension repo, or run:',
      '  yarn workspace @metamask/secret-escrow-client add -D esbuild',
      'then re-run yarn mock-server:pack.',
    ].join('\n'),
  );
}

const esbuildPackage = resolveEsbuildPackage();
const esbuild = await import(pathToFileURL(join(esbuildPackage, 'lib/main.js')).href);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: join(outDir, 'server.mjs'),
  logLevel: 'info',
});

const readme = `# Secret escrow mock server

Tiny local backend for MetaMask social unlock-factor demos (passkey / password / TOTP wipe + rehydration).

## Requirements

- [Node.js](https://nodejs.org/) 18+ (LTS is fine)

## Start

**macOS:** double-click \`start.command\`  
**Windows:** double-click \`start.bat\`  
**Any OS (terminal):**

\`\`\`bash
node server.mjs
\`\`\`

You should see:

\`\`\`text
[secret-escrow-mock] listening on http://127.0.0.1:8787
\`\`\`

Leave this window open while testing.

## Use with the extension zip

1. Start this mock server.
2. Load the provided MetaMask \`dist/chrome\` build in Chrome (\`chrome://extensions\` → Load unpacked).
3. That build must have been compiled with:

   \`\`\`text
   SECRET_ESCROW_URL=http://127.0.0.1:8787
   PASSKEY_ENABLED=true
   \`\`\`

## Optional env vars

| Variable | Default | Meaning |
| --- | --- | --- |
| \`SECRET_ESCROW_MOCK_PORT\` | \`8787\` | Listen port |
| \`SECRET_ESCROW_MOCK_STORE\` | \`./.secret-escrow-mock.json\` | Enrollment persistence file |

## Notes

- Data is stored next to this folder in \`.secret-escrow-mock.json\` (or \`SECRET_ESCROW_MOCK_STORE\`).
- Delete that file and restart the server to wipe enrollments.
- This is a **mock** for local demos — not a production escrow.
`;

writeFileSync(join(outDir, 'README.md'), readme, 'utf8');

writeFileSync(
  join(outDir, 'start.sh'),
  `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install from https://nodejs.org/ and try again."
  exit 1
fi
echo "Starting secret-escrow mock on http://127.0.0.1:8787 ..."
exec node server.mjs
`,
  'utf8',
);

writeFileSync(
  join(outDir, 'start.command'),
  `#!/bin/bash
cd "$(dirname "$0")"
./start.sh
`,
  'utf8',
);

writeFileSync(
  join(outDir, 'start.bat'),
  `@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
echo Starting secret-escrow mock on http://127.0.0.1:8787 ...
node server.mjs
pause
`,
  'utf8',
);

spawnSync('chmod', ['+x', join(outDir, 'start.sh'), join(outDir, 'start.command')], {
  stdio: 'inherit',
});

rmSync(zipPath, { force: true });
const zipResult = spawnSync(
  'zip',
  ['-r', '-q', zipPath, 'portable'],
  { cwd: here, stdio: 'inherit' },
);
if (zipResult.status !== 0) {
  // Fallback without `zip` binary: leave the folder; caller can zip manually.
  console.warn(
    '[secret-escrow-mock] `zip` CLI not available — portable folder built, zip skipped.',
  );
} else {
  // Flatten zip so extracting yields server.mjs at top level of the folder name.
  // Re-pack with a clearer root folder name for testers.
  const namedDir = join(here, 'secret-escrow-mock-server');
  rmSync(namedDir, { recursive: true, force: true });
  mkdirSync(namedDir, { recursive: true });
  for (const name of [
    'server.mjs',
    'README.md',
    'start.sh',
    'start.command',
    'start.bat',
  ]) {
    copyFileSync(join(outDir, name), join(namedDir, name));
  }
  spawnSync('chmod', ['+x', join(namedDir, 'start.sh'), join(namedDir, 'start.command')], {
    stdio: 'inherit',
  });
  rmSync(zipPath, { force: true });
  const namedZip = spawnSync(
    'zip',
    ['-r', '-q', zipPath, 'secret-escrow-mock-server'],
    { cwd: here, stdio: 'inherit' },
  );
  rmSync(namedDir, { recursive: true, force: true });
  if (namedZip.status !== 0) {
    throw new Error('Failed to create secret-escrow-mock-server.zip');
  }
}

const serverBytes = readFileSync(join(outDir, 'server.mjs')).byteLength;
console.log(
  `[secret-escrow-mock] portable server ready (${Math.round(serverBytes / 1024)} KB)`,
);
console.log(`[secret-escrow-mock] folder: ${outDir}`);
if (existsSync(zipPath)) {
  console.log(`[secret-escrow-mock] zip:    ${zipPath}`);
}
