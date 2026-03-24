import * as path from 'node:path';

import type { SourceInfo } from './parse-source';

/**
 * Generates the content for the action types file.
 *
 * @param source - The source information object (controller or service).
 * @returns The content for the action types file.
 */
export function generateActionTypesContent(source: SourceInfo): string {
  const baseFileName = path.basename(source.filePath, '.ts');
  const sourceImportPath = `./${baseFileName}`;

  let content = `/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ${source.name} } from '${sourceImportPath}';

`;

  const actionTypeNames: string[] = [];

  for (const method of source.methods) {
    const capitalizedName =
      method.name.charAt(0).toUpperCase() + method.name.slice(1);
    const actionTypeName = `${source.name}${capitalizedName}Action`;
    const actionString = `${source.name}:${method.name}`;

    actionTypeNames.push(actionTypeName);

    if (method.jsDoc) {
      content += `${method.jsDoc}\n`;
    }

    content += `export type ${actionTypeName} = {
  type: \`${actionString}\`;
  handler: ${source.name}['${method.name}'];
};\n\n`;
  }

  if (actionTypeNames.length > 0) {
    const unionTypeName = `${source.name}MethodActions`;
    content += `/**
 * Union of all ${source.name} action types.
 */
export type ${unionTypeName} = ${actionTypeNames.join(' | ')};\n`;
  }

  return `${content.trimEnd()}\n`;
}
