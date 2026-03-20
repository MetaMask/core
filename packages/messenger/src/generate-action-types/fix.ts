import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateActionTypesContent } from './generate-content';
import type { ControllerInfo } from './parse-controller';
import type { ESLint } from './types';

/**
 * Generates action types files for all controllers.
 *
 * @param controllers - Array of controller information objects.
 * @param eslint - Optional ESLint instance and static methods for formatting.
 */
export async function generateAllActionTypesFiles(
  controllers: ControllerInfo[],
  eslint: ESLint | null,
): Promise<void> {
  const outputFiles: string[] = [];

  for (const controller of controllers) {
    console.log(`\n🔧 Processing ${controller.name}...`);
    const outputDir = path.dirname(controller.filePath);
    const baseFileName = path.basename(controller.filePath, '.ts');
    const outputFile = path.join(
      outputDir,
      `${baseFileName}-method-action-types.ts`,
    );

    const generatedContent = generateActionTypesContent(controller);
    await fs.promises.writeFile(outputFile, generatedContent, 'utf8');
    outputFiles.push(outputFile);
    console.log(`✅ Generated action types for ${controller.name}`);
  }

  if (outputFiles.length > 0 && eslint) {
    console.log('\n📝 Running ESLint on generated files...');

    const results = await eslint.instance.lintFiles(outputFiles);
    await eslint.static.outputFixes(results);
    const errors = eslint.static.getErrorResults(results);
    if (errors.length > 0) {
      console.error('❌ ESLint errors:', errors);
      globalThis.process.exitCode = 1;
    } else {
      console.log('✅ ESLint formatting applied');
    }
  }
}
