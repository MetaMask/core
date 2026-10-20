import { defineRule } from '@oxlint/plugins';
import type { VisitorWithHooks } from '@oxlint/plugins';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PACKAGE_GUIDELINES_PATH } from './constants.ts';

/**
 * Matches the name of an index file, such as `index.ts` or `index.mjs`.
 */
const INDEX_FILE_NAME_PATTERN = /^index\.[cm]?[jt]sx?$/u;

/**
 * Matches the extension of a built file that an `exports` target may point
 * to, such as `.js` or `.d.mts`.
 */
const BUILT_FILE_EXTENSION_PATTERN = /(?:\.d)?\.[cm]?js$|\.d\.[cm]?ts$/u;

/**
 * The prefix that `exports` targets for built files begin with.
 */
const BUILT_FILE_PREFIX = './dist/';

/**
 * Entrypoints for each package, keyed by the path to the package directory.
 *
 * Reading and parsing `package.json` for every linted file would be wasteful,
 * so each package's entrypoints are computed once per lint run.
 */
const entrypointPatternsByPackageDirectory = new Map<string, RegExp[]>();

/**
 * Rule that bans `index` files in subdirectories of a package's `src/`
 * directory, unless they serve as an entrypoint for a subpath export.
 */
export const noBarrelFiles = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow "barrel" files in subdirectories of a package, except for subpath entrypoints.',
    },
    schema: [],
    messages: {
      noSubpathIndexFile: `"Barrel" files are not allowed in subdirectories of a package unless they are entrypoints listed under \`exports\` in \`package.json\`. Files like these hide the public surface area of a package. Export each symbol by name from the package's root \`index.ts\` instead. Learn more: ${PACKAGE_GUIDELINES_PATH}.`,
    },
  },

  createOnce(context): VisitorWithHooks {
    return {
      Program(node) {
        if (isDisallowedIndexFile(context.filename)) {
          context.report({ node, messageId: 'noSubpathIndexFile' });
        }
      },
    };
  },
});

/**
 * Determines whether the given file is an index file that is neither the
 * root index file of a package nor an entrypoint for a subpath export.
 *
 * @param filePath - The absolute path to the file being linted.
 * @returns True if the file should be reported, false otherwise.
 */
function isDisallowedIndexFile(filePath: string): boolean {
  if (!INDEX_FILE_NAME_PATTERN.test(path.basename(filePath))) {
    return false;
  }

  const packageDirectory = findPackageDirectory(filePath);
  if (packageDirectory === null) {
    return false;
  }

  const sourcePath = toPosixPath(
    path.relative(path.join(packageDirectory, 'src'), filePath),
  );
  if (!sourcePath.includes('/')) {
    return false;
  }

  const sourcePathWithoutExtension = sourcePath.replace(/\.[^./]+$/u, '');
  return !getEntrypointPatterns(packageDirectory).some((pattern) =>
    pattern.test(sourcePathWithoutExtension),
  );
}

/**
 * Finds the package that the given file belongs to, as long as the file lives
 * within the package's `src/` directory.
 *
 * @param filePath - The absolute path to the file being linted.
 * @returns The absolute path to the package directory, or null if the file is
 * not within the `src/` directory of a package.
 */
function findPackageDirectory(filePath: string): string | null {
  let directory = path.dirname(filePath);

  while (directory !== path.dirname(directory)) {
    const parentDirectory = path.dirname(directory);
    if (
      path.basename(directory) === 'src' &&
      fs.existsSync(path.join(parentDirectory, 'package.json'))
    ) {
      return parentDirectory;
    }
    directory = parentDirectory;
  }

  return null;
}

/**
 * Gets patterns that match the source files (relative to `src/`, without
 * extensions) which serve as entrypoints for the given package.
 *
 * @param packageDirectory - The absolute path to the package directory.
 * @returns The entrypoint patterns.
 */
function getEntrypointPatterns(packageDirectory: string): RegExp[] {
  const cachedPatterns =
    entrypointPatternsByPackageDirectory.get(packageDirectory);
  if (cachedPatterns) {
    return cachedPatterns;
  }

  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  const exportsField =
    typeof manifest === 'object' && manifest !== null && 'exports' in manifest
      ? manifest.exports
      : undefined;
  const patterns = collectExportTargets(exportsField)
    .filter((target) => target.startsWith(BUILT_FILE_PREFIX))
    .map((target) =>
      convertToSourcePattern(
        target
          .slice(BUILT_FILE_PREFIX.length)
          .replace(BUILT_FILE_EXTENSION_PATTERN, ''),
      ),
    );

  entrypointPatternsByPackageDirectory.set(packageDirectory, patterns);
  return patterns;
}

/**
 * Collects every file path that an `exports` field in `package.json` points
 * to, however deeply nested its conditions are.
 *
 * @param exportsValue - The `exports` field, or a value nested within it.
 * @returns The file paths.
 */
function collectExportTargets(exportsValue: unknown): string[] {
  if (typeof exportsValue === 'string') {
    return [exportsValue];
  }

  if (typeof exportsValue === 'object' && exportsValue !== null) {
    return Object.values(exportsValue).flatMap(collectExportTargets);
  }

  return [];
}

/**
 * Converts a path from an `exports` target, which may contain a `*`
 * wildcard, into a pattern that matches source paths.
 *
 * @param targetPath - The path from the `exports` target, relative to `dist/`
 * and without an extension.
 * @returns The pattern.
 */
function convertToSourcePattern(targetPath: string): RegExp {
  const escapedPath = targetPath
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.+');
  return new RegExp(`^${escapedPath}$`, 'u');
}

/**
 * Converts a path that uses the separator for the current platform into one
 * that uses forward slashes, so that it can be compared with paths in
 * `package.json`.
 *
 * @param filePath - The path to convert.
 * @returns The converted path.
 */
function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
