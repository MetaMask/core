import { RuleTester } from 'oxlint/plugins-dev';

import { noWildcardExports } from './no-wildcard-exports.ts';

// This is a bit strange but is recommended.
// See: https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html#writing-tests-for-custom-rules
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'ts' },
  },
});

ruleTester.run('no-wildcard-exports', noWildcardExports, {
  valid: [
    {
      name: 'a named re-export',
      code: "export { Foo } from './foo';",
    },
    {
      name: 'a type-only named re-export',
      code: "export type { Foo } from './foo';",
    },
    {
      name: 'a local named export',
      code: 'export const foo = 1;',
    },
    {
      name: 'a manually built grouping object exported by name',
      code: [
        "import { FOO, BAR } from './constants';",
        'export const Constants = { FOO, BAR };',
      ].join('\n'),
    },
  ],

  invalid: [
    {
      name: 'a wildcard re-export',
      code: "export * from './foo';",
      errors: [{ messageId: 'noNamedWildcardExport' }],
    },
    {
      name: 'a type-only wildcard re-export',
      code: "export type * from './foo';",
      errors: [{ messageId: 'noNamedWildcardExport' }],
    },
    {
      name: 'a namespace re-export',
      code: "export * as Foo from './foo';",
      errors: [{ messageId: 'noNamespaceExport' }],
    },
    {
      name: 'a type-only namespace re-export',
      code: "export type * as Foo from './foo';",
      errors: [{ messageId: 'noNamespaceExport' }],
    },
  ],
});
