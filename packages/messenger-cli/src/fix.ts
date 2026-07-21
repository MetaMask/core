import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';
import type { Formatter } from './types';

/**
 * Generates action types files for all controllers/services.
 *
 * @param sources - Array of source information objects.
 * @param formatter - The formatter to use for formatting the generated content.
 * @param esm - Whether to add `.js` extensions to import paths for ESM
 * compatibility.
 * @returns Whether all files were generated successfully.
 */
export async function generateAllActionTypesFiles(
  sources: SourceInfo[],
  formatter: Formatter,
  esm = false,
): Promise<void> {
  for (const source of sources) {
    console.log(`\n🔧 Processing ${source.name}...`);
    const outputDir = path.dirname(source.filePath);
    const baseFileName = path.basename(source.filePath, '.ts');
    const outputFile = path.join(
      outputDir,
      `${baseFileName}-method-action-types.ts`,
    );

    const generatedContent = await generateActionTypesContent(
      source,
      formatter,
      esm,
    );

    await fs.promises.writeFile(outputFile, generatedContent, 'utf8');
    console.log(`✅ Generated action types for ${source.name}`);
  }
}
