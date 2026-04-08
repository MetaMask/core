import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';
import type { ESLint } from './types';

/**
 * Generates action types files for all controllers/services.
 *
 * @param sources - Array of source information objects.
 * @param eslint - Optional ESLint instance and static methods for formatting.
 * @returns Whether all files were generated successfully.
 */
export async function generateAllActionTypesFiles(
  sources: SourceInfo[],
  eslint: ESLint | null,
): Promise<boolean> {
  const outputFiles: string[] = [];

  for (const source of sources) {
    console.log(`\n🔧 Processing ${source.name}...`);
    const outputDir = path.dirname(source.filePath);
    const baseFileName = path.basename(source.filePath, '.ts');
    const outputFile = path.join(
      outputDir,
      `${baseFileName}-method-action-types.ts`,
    );

    const generatedContent = generateActionTypesContent(source);
    await fs.promises.writeFile(outputFile, generatedContent, 'utf8');
    outputFiles.push(outputFile);
    console.log(`✅ Generated action types for ${source.name}`);
  }

  if (outputFiles.length > 0 && eslint) {
    console.log('\n📝 Running ESLint on generated files...');

    const results = await eslint.instance.lintFiles(outputFiles);
    await eslint.eslintClass.outputFixes(results);
    const errors = eslint.eslintClass.getErrorResults(results);
    if (errors.length > 0) {
      console.error('❌ ESLint errors:', errors);
      return false;
    }
    console.log('✅ ESLint formatting applied');
  }

  return true;
}
