import { assertExhaustive, getErrorMessage } from '@metamask/utils';
import * as path from 'node:path';

import type { SourceInfo } from './parse-source';
import { Formatter } from './types';

/**
 * The default options used by Oxfmt and Prettier when formatting the generated
 * content. In the case of Prettier, these options will be used if the user does
 * not have a Prettier configuration file in their project. Oxfmt doesn't have a
 * `resolveConfig` function like Prettier, so it will always use these options
 * when formatting.
 */
const DEFAULT_FORMATTING_OPTIONS = {
  printWidth: 80,
  singleQuote: true,
};

/**
 * Safely format a TypeScript file with Prettier. If Prettier is not installed,
 * it will throw an error with a clear message. This allows us to use Prettier
 * for formatting when available, without making it a hard dependency of the
 * project.
 *
 * @param contents - The source code to format.
 * @param filePath - The file path to use for resolving Prettier configuration.
 * @returns The formatted source code.
 */
async function prettier(contents: string, filePath: string): Promise<string> {
  try {
    const { format, resolveConfig } = await import('prettier');

    const config =
      (await resolveConfig(filePath)) ?? DEFAULT_FORMATTING_OPTIONS;

    return await format(contents, {
      ...config,
      parser: 'typescript',
    });
  } catch (error) {
    const message = getErrorMessage(error);
    throw new Error(
      `Failed to format source code with Prettier. Is Prettier installed?\n\n${message}`,
    );
  }
}

/**
 * Safely format a TypeScript file with Oxfmt. If Oxfmt is not installed, it
 * will throw an error with a clear message. This allows us to use Oxfmt for
 * formatting when available, without making it a hard dependency of the
 * project.
 *
 * @param contents - The source code to format.
 * @param filePath - The file path to use for resolving Oxfmt configuration. Not
 * currently used, but included for future extensibility.
 * @returns The formatted source code.
 */
async function oxfmt(contents: string, filePath: string): Promise<string> {
  try {
    const { format } = await import('oxfmt');
    const result = await format(filePath, contents, DEFAULT_FORMATTING_OPTIONS);

    return result.code;
  } catch (error) {
    const message = getErrorMessage(error);
    throw new Error(
      `Failed to format source code with Oxfmt. Is Oxfmt installed?\n\n${message}`,
    );
  }
}

/**
 * Get the appropriate formatter function based on the specified formatter.
 *
 * @param formatter - The formatter to use.
 * @returns A function that takes source code as input and returns the formatted
 * source code.
 */
function getFormatter(
  formatter: Formatter,
): (contents: string, filePath: string) => Promise<string> {
  switch (formatter) {
    case 'prettier':
      return prettier;

    case 'oxfmt':
      return oxfmt;

    default:
      return assertExhaustive(formatter);
  }
}

/**
 * Generates the content for the action types file.
 *
 * @param source - The source information object (controller or service).
 * @param formatter - The formatter to use for formatting the generated content.
 * @returns The content for the action types file.
 */
export async function generateActionTypesContent(
  source: SourceInfo,
  formatter: Formatter,
): Promise<string> {
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

  const formatterFunction = getFormatter(formatter);
  return await formatterFunction(content, source.filePath);
}
