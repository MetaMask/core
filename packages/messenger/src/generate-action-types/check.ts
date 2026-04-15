import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';
import type { ESLint } from './types';

/**
 * Checks if generated action types files are up to date.
 *
 * @param sources - Array of source information objects.
 * @param eslint - Optional ESLint instance and static methods for formatting.
 * @returns Whether all files are up to date.
 */
export async function checkActionTypesFiles(
  sources: SourceInfo[],
  eslint: ESLint | null,
): Promise<boolean> {
  let hasErrors = false;

  const fileComparisonJobs: {
    expectedTempFile: string;
    actualFile: string;
    baseFileName: string;
  }[] = [];

  try {
    for (const source of sources) {
      console.log(`\n🔧 Checking ${source.name}...`);
      const outputDir = path.dirname(source.filePath);
      const baseFileName = path.basename(source.filePath, '.ts');
      const actualFile = path.join(
        outputDir,
        `${baseFileName}-method-action-types.ts`,
      );

      const expectedContent = generateActionTypesContent(source);
      const expectedTempFile = actualFile.replace('.ts', '.tmp.ts');

      try {
        await fs.promises.access(actualFile);

        await fs.promises.writeFile(expectedTempFile, expectedContent, 'utf8');

        fileComparisonJobs.push({
          expectedTempFile,
          actualFile,
          baseFileName,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(
            `❌ ${baseFileName}-method-action-types.ts does not exist`,
          );
        } else {
          console.error(
            `❌ Error reading ${baseFileName}-method-action-types.ts:`,
            error,
          );
        }
        hasErrors = true;
      }
    }

    if (fileComparisonJobs.length > 0) {
      if (eslint) {
        console.log('\n📝 Running ESLint to compare files...');

        const results = await eslint.instance.lintFiles(
          fileComparisonJobs.map((job) => job.expectedTempFile),
        );
        await eslint.eslintClass.outputFixes(results);
      }

      for (const job of fileComparisonJobs) {
        const expectedContent = await fs.promises.readFile(
          job.expectedTempFile,
          'utf8',
        );
        const actualContent = await fs.promises.readFile(
          job.actualFile,
          'utf8',
        );

        if (expectedContent === actualContent) {
          console.log(
            `✅ ${job.baseFileName}-method-action-types.ts is up to date`,
          );
        } else {
          console.error(
            `❌ ${job.baseFileName}-method-action-types.ts is out of date`,
          );
          hasErrors = true;
        }
      }
    }
  } finally {
    for (const job of fileComparisonJobs) {
      try {
        await fs.promises.unlink(job.expectedTempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  if (hasErrors) {
    console.error('\n💥 Some action type files are out of date or missing.');
    console.error(
      'Run `yarn generate-method-action-types --fix` to update them.',
    );
    return false;
  }

  console.log('\n🎉 All action type files are up to date!');
  return true;
}
