import fs from 'fs';
import * as path from 'path';
import yargs from 'yargs';

import codeownersSections from '../../codeowners';

/**
 * The path to the generated CODEOWNERS file.
 */
const CODEOWNERS_FILE_PATH = path.resolve(
  __dirname,
  '../../.github/CODEOWNERS',
);

/**
 * The lines that appear before the CODEOWNERS rules.
 */
const CODEOWNERS_PRELUDE = `
# Lines starting with '#' are comments.
# Each line is a file pattern followed by one or more owners.

# Note: Please keep this synchronized with the \`teams.json\` file in the repository root.
# That file is used for some automated workflows, and maps controller to owning team(s).
`.trim();

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
  const generatedContent = generateCodeownersFileContent();

  if (existingContent !== generatedContent) {
    console.error(
      'CODEOWNERS is out of date. Run `yarn codeowners:generate` to update it.',
    );
    process.exitCode = 1;
  }
}

/**
 * Generates the CODEOWNERS file on disk.
 */
async function generateCodeowners(): Promise<void> {
  await fs.promises.writeFile(
    CODEOWNERS_FILE_PATH,
    generateCodeownersFileContent(),
  );
}

/**
 * Generates the content of the CODEOWNERS file from the configuration in
 * `codeowners.ts`.
 *
 * @returns The full CODEOWNERS file contents.
 */
function generateCodeownersFileContent(): string {
  const sectionLines = codeownersSections.map((section) => {
    const lines: string[] = [];

    // This is useful to discriminate the union.
    // eslint-disable-next-line no-restricted-syntax
    if ('title' in section) {
      lines.push(`## ${section.title}`);
    }

    const maxPatternLength = Math.max(
      ...section.rules.map((rule) => rule.pattern.length),
    );
    const patternLengthWithPadding = maxPatternLength + 4;
    for (const rule of section.rules) {
      lines.push(
        rule.pattern.padEnd(patternLengthWithPadding) + rule.owners.join(' '),
      );
    }

    return lines.join('\n');
  });

  return [CODEOWNERS_PRELUDE, ...sectionLines].join('\n\n');
}
