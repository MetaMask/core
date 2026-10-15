import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'oxlint/plugins-dev';

import { noBarrelFiles } from './no-barrel-files.ts';

const FIXTURES_DIRECTORY = fileURLToPath(
  new URL('__fixtures__', import.meta.url),
);

// This is a bit strange but is recommended.
// See: https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html#writing-tests-for-custom-rules
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  cwd: FIXTURES_DIRECTORY,
  languageOptions: {
    sourceType: 'module',
  },
});

ruleTester.run('no-barrel-files', noBarrelFiles, {
  valid: [
    {
      name: 'the root index file of a package',
      filename: getFixturePath('packages/with-subpath-exports/src/index.ts'),
      code: "export { foo } from './foo';",
    },
    {
      name: 'an index file that is the entrypoint for a subpath export',
      filename: getFixturePath('packages/with-subpath-exports/src/v2/index.ts'),
      code: "export { foo } from './foo';",
    },
    {
      name: 'a non-index file in a subdirectory',
      filename: getFixturePath(
        'packages/with-subpath-exports/src/module/foo.ts',
      ),
      code: 'export const foo = 1;',
    },
    {
      name: 'a file matching a wildcard subpath export',
      filename: getFixturePath(
        'packages/with-subpath-exports/src/utils/index.ts',
      ),
      code: 'export const foo = 1;',
    },
    {
      name: 'an index file outside of a package source directory',
      filename: getFixturePath('scripts/module/index.ts'),
      code: 'export const foo = 1;',
    },
    {
      name: 'an index file in a package without an `exports` field at its root',
      filename: getFixturePath('packages/without-exports/src/index.ts'),
      code: 'export const foo = 1;',
    },
  ],

  invalid: [
    {
      name: 'an index file in a subdirectory of a package',
      filename: getFixturePath(
        'packages/with-subpath-exports/src/module/index.ts',
      ),
      code: "export { foo } from './foo';",
      errors: [{ messageId: 'noSubpathIndexFile' }],
    },
    {
      name: 'an index file nested several levels deep',
      filename: getFixturePath(
        'packages/with-subpath-exports/src/v2/module/index.ts',
      ),
      code: "export { foo } from './foo';",
      errors: [{ messageId: 'noSubpathIndexFile' }],
    },
    {
      name: 'an index file whose subdirectory is not exported',
      filename: getFixturePath('packages/without-exports/src/module/index.ts'),
      code: "export { foo } from './foo';",
      errors: [{ messageId: 'noSubpathIndexFile' }],
    },
    {
      name: 'an index file with an extension other than `.ts`',
      filename: getFixturePath(
        'packages/with-subpath-exports/src/module/index.mts',
      ),
      code: "export { foo } from './foo';",
      errors: [{ messageId: 'noSubpathIndexFile' }],
    },
    {
      name: 'an index file with no contents',
      filename: getFixturePath(
        'packages/with-subpath-exports/src/module/index.ts',
      ),
      code: '',
      errors: [{ messageId: 'noSubpathIndexFile' }],
    },
  ],
});

/**
 * Builds an absolute path to a file within the fixtures directory.
 *
 * @param relativePath - The path to the file, relative to the fixtures
 * directory.
 * @returns The absolute path.
 */
function getFixturePath(relativePath: string): string {
  return path.join(FIXTURES_DIRECTORY, relativePath);
}
