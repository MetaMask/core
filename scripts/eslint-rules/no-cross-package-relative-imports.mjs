/**
 * ESLint rule: no-cross-package-relative-imports
 *
 * Forbids relative imports that resolve to a file in a different package
 * (i.e. a different nearest `package.json`). The auto-fixer rewrites the
 * import to the target package's name, without appending a deep sub-path.
 *
 * For example, the following
 *
 *   import type { MultichainAccountServiceWalletStatusChangeEvent } from '../../multichain-account-service/src/types';
 *
 * would be auto-fixed to:
 *
 *   import type { MultichainAccountServiceWalletStatusChangeEvent } from '@metamask/multichain-account-service';
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walk up from a directory until a `package.json` is found.
 *
 * @param {string} startingDirectory - The directory to start searching from.
 * @returns {string | undefined} The name of a package if one is found, or
 * `undefined` otherwise.
 */
function findPackage(startingDirectory) {
  let workingDirectory = startingDirectory;

  while (true) {
    const pkgPath = join(workingDirectory, 'package.json');
    try {
      // ESLint rules must be synchronous.
      // eslint-disable-next-line n/no-sync
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      // Assume that all packages have names
      return pkg.name;
    } catch {
      // No valid package.json here. Keep walking.
    }
    const parentDirectory = dirname(workingDirectory);
    if (parentDirectory === workingDirectory) {
      return undefined;
    }
    workingDirectory = parentDirectory;
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid relative imports that cross package boundaries in a monorepo',
    },
    fixable: 'code',
    messages: {
      noRelativeCrossPackage:
        "Do not use a relative path to import files from other packages. Use a known export as declared in the package's manifest.\n" +
        "For example, in this case, try: `import { ... } from '{{ importedPackageName }}'`",
    },
    schema: [],
  },

  create(context) {
    /**
     * Check a single import/re-export source literal.
     *
     * @param {import('estree').Literal | null} sourceNode - The source literal
     * node from an import or export declaration.
     */
    function check(sourceNode) {
      if (!sourceNode) {
        return;
      }

      const importPath = sourceNode.value;

      // We only care about relative imports
      if (!importPath.startsWith('.')) {
        return;
      }

      const currentDirectory = dirname(
        context.physicalFilename ?? context.filename,
      );
      const currentPackageName = findPackage(currentDirectory);
      const importedPackageName = findPackage(
        dirname(resolve(currentDirectory, importPath)),
      );

      if (!currentPackageName || !importedPackageName) {
        return;
      }

      // It's okay to use a relative path to import a file from our own package
      if (currentPackageName === importedPackageName) {
        return;
      }

      context.report({
        node: sourceNode,
        messageId: 'noRelativeCrossPackage',
        data: {
          importedPackageName,
        },
        fix(fixer) {
          return fixer.replaceText(sourceNode, `'${importedPackageName}'`);
        },
      });
    }

    return {
      ImportDeclaration(node) {
        check(node.source);
      },
      ExportNamedDeclaration(node) {
        check(node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source);
      },
    };
  },
};

export default rule;
