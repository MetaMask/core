import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateActionTypesContent } from './generate-content';
import type { ControllerInfo } from './parse-controller';

type ESLintInstance = {
  lintFiles(files: string[]): Promise<{ output?: string; filePath: string }[]>;
};

type ESLintStatic = {
  outputFixes(results: { output?: string; filePath: string }[]): Promise<void>;
};

/**
 * Checks if generated action types files are up to date.
 *
 * @param controllers - Array of controller information objects.
 * @param eslint - The ESLint instance to use for formatting.
 * @param eslintStatic - The ESLint class for static methods.
 */
export async function checkActionTypesFiles(
  controllers: ControllerInfo[],
  eslint: ESLintInstance | null,
  eslintStatic: ESLintStatic | null,
): Promise<void> {
  let hasErrors = false;

  const fileComparisonJobs: {
    expectedTempFile: string;
    actualFile: string;
    baseFileName: string;
  }[] = [];

  try {
    for (const controller of controllers) {
      console.log(`\n🔧 Checking ${controller.name}...`);
      const outputDir = path.dirname(controller.filePath);
      const baseFileName = path.basename(controller.filePath, '.ts');
      const actualFile = path.join(
        outputDir,
        `${baseFileName}-method-action-types.ts`,
      );

      const expectedContent = generateActionTypesContent(controller);
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
      if (eslint && eslintStatic) {
        console.log('\n📝 Running ESLint to compare files...');

        const results = await eslint.lintFiles(
          fileComparisonJobs.map((job) => job.expectedTempFile),
        );
        await eslintStatic.outputFixes(results);
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
    globalThis.process.exitCode = 1;
  } else {
    console.log('\n🎉 All action type files are up to date!');
  }
}
