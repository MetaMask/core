import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repositoryUrl = 'https://github.com/MetaMask/contract-metadata.git';
const outputPath = join(
  import.meta.dirname,
  '../src/mappers/helpers/contract-metadata-index.json',
);

const tempDirectory = mkdtempSync(join(tmpdir(), 'contract-metadata-'));

try {
  execFileSync('git', ['clone', '--depth', '1', repositoryUrl, tempDirectory], {
    stdio: 'inherit',
  });

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: tempDirectory,
    encoding: 'utf8',
  }).trim();

  execFileSync(
    'node',
    [
      '-e',
      "const fs=require('fs'); const map=require('./buildindex.js'); fs.writeFileSync('contract-metadata-index.json', JSON.stringify(map, null, 2));",
    ],
    { cwd: tempDirectory, stdio: 'inherit' },
  );

  const contractMap = JSON.parse(
    readFileSync(join(tempDirectory, 'contract-metadata-index.json'), 'utf8'),
  );

  writeFileSync(outputPath, `${JSON.stringify(contractMap, null, 2)}\n`);

  console.log(
    `Synced ${Object.keys(contractMap).length} entries from ${repositoryUrl}@${commit} to ${outputPath}`,
  );
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
