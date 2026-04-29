import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';
import { Formatter } from './types';

/**
 * Checks if generated action types files are up to date.
 *
 * @param sources - Array of source information objects.
 * @param formatter - The formatter to use for formatting the generated content.
 * @returns Whether all files are up to date.
 */
export async function checkActionTypesFiles(
  sources: SourceInfo[],
  formatter: Formatter,
): Promise<boolean> {
  let hasErrors = false;

  const fileComparisonJobs: {
    expectedContent: string;
    actualFile: string;
    baseFileName: string;
  }[] = [];

  for (const source of sources) {
    console.log(`\n🔧 Checking ${source.name}...`);
    const outputDir = path.dirname(source.filePath);
    const baseFileName = path.basename(source.filePath, '.ts');
    const actualFile = path.join(
      outputDir,
      `${baseFileName}-method-action-types.ts`,
    );

    const expectedContent = await generateActionTypesContent(source, formatter);

    try {
      await fs.promises.access(actualFile);
      fileComparisonJobs.push({
        expectedContent,
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
    for (const job of fileComparisonJobs) {
      const actualContent = await fs.promises.readFile(job.actualFile, 'utf8');

      if (job.expectedContent === actualContent) {
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

  if (hasErrors) {
    console.error('\n💥 Some action type files are out of date or missing.');
    console.error('Run `messenger-action-types --generate` to update them.');
    return false;
  }

  console.log('\n🎉 All action type files are up to date!');
  return true;
}
