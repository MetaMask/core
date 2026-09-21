import fs from 'fs';
import * as path from 'path';
import yargs from 'yargs';

import config from '../../codeowners.js';
import { generateCodeownersFileContent } from './generate.js';

/**
 * The path to the generated CODEOWNERS file.
 */
const CODEOWNERS_FILE_PATH = path.resolve(
  import.meta.dirname,
  '../../.github/CODEOWNERS',
);

/**
 * The entrypoint to the script.
 */
export async function main(): Promise<void> {
  await yargs(process.argv.slice(2))
    .command(
      'check',
      'Check whether CODEOWNERS is up to date without writing changes.',
      checkCodeowners,
    )
    .command(
      'generate',
      'Generate the repository CODEOWNERS file.',
      generateCodeowners,
    )
    .demandCommand(1, 'Please specify either `check` or `generate`.')
    .strict()
    .help('help')
    .usage('Manage the repository CODEOWNERS file.\nUsage: $0 <command>')
    .parseAsync();
}

/**
 * Generates a new version of CODEOWNERS in memory from the configuration in
 * `codeowners.ts` and compares it to the existing file, printing an error if
 * there are any differences or otherwise silently succeeding.
 */
async function checkCodeowners(): Promise<void> {
  const existingContent = await fs.promises.readFile(
    CODEOWNERS_FILE_PATH,
    'utf8',
  );
  const generatedContent = generateCodeownersFileContent(config);

  if (existingContent !== generatedContent) {
    console.error(
      'CODEOWNERS is out of date. Run `yarn codeowners:generate` to update it.',
    );
    process.exitCode = 1;
  }
}

/**
 * Generates a new version of the CODEOWNERS file, then writes it to disk.
 */
async function generateCodeowners(): Promise<void> {
  await fs.promises.writeFile(
    CODEOWNERS_FILE_PATH,
    generateCodeownersFileContent(config),
  );
}
