import { defineRule } from '@oxlint/plugins';
import type { VisitorWithHooks } from '@oxlint/plugins';

import { PACKAGE_GUIDELINES_PATH } from './constants.ts';

/**
 * Rule that bans wildcard exports (`export * from` and `export * as Ns from`,
 * along with their type-only variants).
 */
export const noWildcardExports = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow wildcard exports (`export * from` and `export * as Ns from`).',
    },
    schema: [],
    messages: {
      noNamedWildcardExport: `Named wildcard exports are not allowed. These kinds of exports hide the public surface area of a module and make it easy to expose symbols to consumers by accident. Name each export explicitly instead. Learn more: ${PACKAGE_GUIDELINES_PATH}.`,
      noNamespaceExport: `Namespace re-exports are not allowed. These kinds of exports hide the public surface area of a module and make it easy to expose symbols to consumers by accident. Build the grouping object explicitly and export it by name, and export types individually by name. Learn more: ${PACKAGE_GUIDELINES_PATH}.`,
    },
  },

  createOnce(context): VisitorWithHooks {
    return {
      ExportAllDeclaration(node) {
        const messageId =
          node.exported === null
            ? 'noNamedWildcardExport'
            : 'noNamespaceExport';
        context.report({ node, messageId });
      },
    };
  },
});
