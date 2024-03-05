// This file is intended to be used only in a Node.js context.
/* eslint-disable import/no-nodejs-modules */

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as uuid from 'uuid';

import { isErrorWithCode, wrapError } from './errors';
import type { Json } from './json';

/**
 * Information about the file sandbox provided to tests that need temporary
 * access to the filesystem.
 */
export type FileSandbox = {
  directoryPath: string;
  withinSandbox: (
    test: (args: { directoryPath: string }) => Promise<void>,
  ) => Promise<void>;
};

/**
 * Read the file at the given path, assuming its content is encoded as UTF-8.
 *
 * @param filePath - The path to the file.
 * @returns The content of the file.
 * @throws An error with a stack trace if reading fails in any way.
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    throw wrapError(error, `Could not read file '${filePath}'`);
  }
}

/**
 * Write content to the file at the given path, creating the directory structure
 * for the file automatically if necessary.
 *
 * @param filePath - The path to the file.
 * @param content - The new content of the file.
 * @throws An error with a stack trace if writing fails in any way.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content);
  } catch (error) {
    throw wrapError(error, `Could not write file '${filePath}'`);
  }
}

/**
 * Read the assumed JSON file at the given path, attempts to parse it, and
 * get the resulting object. Supports a custom parser (in case you want to
 * use the [JSON5](https://www.npmjs.com/package/json5) package instead).
 *
 * @param filePath - The path segments pointing to the JSON file. Will be passed
 * to path.join().
 * @param options - Options to this function.
 * @param options.parser - The parser object to use. Defaults to `JSON`.
 * @param options.parser.parse - A function that parses JSON data.
 * @returns The object corresponding to the parsed JSON file, typed against the
 * struct.
 * @throws An error with a stack trace if reading fails in any way, or if the
 * parsed value is not a plain object.
 */
export async function readJsonFile<Value extends Json>(
  filePath: string,
  {
    parser = JSON,
  }: {
    parser?: {
      parse: (
        text: Parameters<typeof JSON.parse>[0],
      ) => ReturnType<typeof JSON.parse>;
    };
  } = {},
): Promise<Value> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return parser.parse(content);
  } catch (error) {
    throw wrapError(error, `Could not read JSON file '${filePath}'`);
  }
}

/**
 * Attempt to write the given JSON-like value to the file at the given path,
 * creating the directory structure for the file automatically if necessary.
 * Adds a newline to the end of the file. Supports a custom parser (in case you
 * want to use the [JSON5](https://www.npmjs.com/package/json5) package
 * instead).
 *
 * @param filePath - The path to write the JSON file to, including the file
 * itself.
 * @param jsonValue - The JSON-like value to write to the file. Make sure that
 * JSON.stringify can handle it.
 * @param options - The options to this function.
 * @param options.prettify - Whether to format the JSON as it is turned into a
 * string such that it is broken up into separate lines (using 2 spaces as
 * indentation).
 * @param options.stringifier - The stringifier to use. Defaults to `JSON`.
 * @param options.stringifier.stringify - A function that stringifies JSON.
 * @returns The object corresponding to the parsed JSON file, typed against the
 * struct.
 * @throws An error with a stack trace if writing fails in any way.
 */
export async function writeJsonFile(
  filePath: string,
  jsonValue: Json,
  {
    stringifier = JSON,
    prettify = false,
  }: {
    stringifier?: {
      stringify: typeof JSON.stringify;
    };
    prettify?: boolean;
  } = {},
): Promise<void> {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const json = prettify
      ? stringifier.stringify(jsonValue, null, '  ')
      : stringifier.stringify(jsonValue);
    await fs.promises.writeFile(filePath, json);
  } catch (error) {
    throw wrapError(error, `Could not write JSON file '${filePath}'`);
  }
}

/**
 * Test the given path to determine whether it represents a file.
 *
 * @param filePath - The path to a (supposed) file on the filesystem.
 * @returns A promise for true if the file exists or false otherwise.
 * @throws An error with a stack trace if reading fails in any way.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      return false;
    }

    throw wrapError(error, `Could not determine if file exists '${filePath}'`);
  }
}

/**
 * Test the given path to determine whether it represents a directory.
 *
 * @param directoryPath - The path to a (supposed) directory on the filesystem.
 * @returns A promise for true if the file exists or false otherwise.
 * @throws An error with a stack trace if reading fails in any way.
 */
export async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(directoryPath);
    return stats.isDirectory();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      return false;
    }

    throw wrapError(
      error,
      `Could not determine if directory exists '${directoryPath}'`,
    );
  }
}

/**
 * Create the given directory along with any directories leading up to the
 * directory, or do nothing if the directory already exists.
 *
 * @param directoryPath - The path to the desired directory.
 * @throws An error with a stack trace if reading fails in any way.
 */
export async function ensureDirectoryStructureExists(
  directoryPath: string,
): Promise<void> {
  try {
    await fs.promises.mkdir(directoryPath, { recursive: true });
  } catch (error) {
    throw wrapError(
      error,
      `Could not create directory structure '${directoryPath}'`,
    );
  }
}

/**
 * Remove the given file or directory if it exists, or do nothing if it does
 * not.
 *
 * @param entryPath - The path to the file or directory.
 * @throws An error with a stack trace if removal fails in any way.
 */
export async function forceRemove(entryPath: string): Promise<void> {
  try {
    return await fs.promises.rm(entryPath, {
      recursive: true,
      force: true,
    });
  } catch (error) {
    throw wrapError(error, `Could not remove file or directory '${entryPath}'`);
  }
}

/**
 * Construct a sandbox object which can be used in tests that need temporary
 * access to the filesystem.
 *
 * @param projectName - The name of the project.
 * @returns The sandbox object. This contains a `withinSandbox` function which
 * can be used in tests (see example).
 * @example
 * ```typescript
 * const { withinSandbox } = createSandbox('utils');
 *
 * // ... later ...
 *
 * it('does something with the filesystem', async () => {
 *   await withinSandbox(async ({ directoryPath }) => {
 *     await fs.promises.writeFile(
 *       path.join(directoryPath, 'some-file'),
 *       'some content',
 *       'utf8'
 *     );
 *   })
 * });
 * ```
 */
export function createSandbox(projectName: string): FileSandbox {
  const directoryPath = path.join(os.tmpdir(), projectName, uuid.v4());

  return {
    directoryPath,
    async withinSandbox(
      test: (args: { directoryPath: string }) => Promise<void>,
    ) {
      if (await directoryExists(directoryPath)) {
        throw new Error(`${directoryPath} already exists. Cannot continue.`);
      }

      await ensureDirectoryStructureExists(directoryPath);

      try {
        await test({ directoryPath });
      } finally {
        await forceRemove(directoryPath);
      }
    },
  };
}
