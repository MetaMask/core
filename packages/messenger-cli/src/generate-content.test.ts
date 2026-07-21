import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';

describe('generateActionTypesContent', () => {
  it('generates action types for a controller with one method', async () => {
    const controller: SourceInfo = {
      name: 'FooController',
      filePath: '/some/path/FooController.ts',

      methods: [
        {
          name: 'doSomething',
          jsDoc: '',
        },
      ],
    };

    const result = await generateActionTypesContent(controller, 'prettier');
    expect(result).toMatchInlineSnapshot(`
      "/**
       * This file is auto generated.
       * Do not edit manually.
       */

      import type { FooController } from './FooController';

      export type FooControllerDoSomethingAction = {
        type: \`FooController:doSomething\`;
        handler: FooController['doSomething'];
      };

      /**
       * Union of all FooController action types.
       */
      export type FooControllerMethodActions = FooControllerDoSomethingAction;
      "
    `);
  });

  it('generates action types for a controller with multiple methods', async () => {
    const controller: SourceInfo = {
      name: 'BarController',
      filePath: '/some/path/BarController.ts',

      methods: [
        { name: 'methodA', jsDoc: '' },
        { name: 'methodB', jsDoc: '' },
      ],
    };

    const result = await generateActionTypesContent(controller, 'prettier');
    expect(result).toMatchInlineSnapshot(`
      "/**
       * This file is auto generated.
       * Do not edit manually.
       */

      import type { BarController } from './BarController';

      export type BarControllerMethodAAction = {
        type: \`BarController:methodA\`;
        handler: BarController['methodA'];
      };

      export type BarControllerMethodBAction = {
        type: \`BarController:methodB\`;
        handler: BarController['methodB'];
      };

      /**
       * Union of all BarController action types.
       */
      export type BarControllerMethodActions =
        | BarControllerMethodAAction
        | BarControllerMethodBAction;
      "
    `);
  });

  it('formats the generated content with Oxfmt if specified', async () => {
    const controller: SourceInfo = {
      name: 'BazController',
      filePath: '/some/path/BazController.ts',

      methods: [{ name: 'doSomething', jsDoc: '' }],
    };

    const result = await generateActionTypesContent(controller, 'oxfmt');
    expect(result).toMatchInlineSnapshot(`
      "/**
       * This file is auto generated.
       * Do not edit manually.
       */

      import type { BazController } from './BazController';

      export type BazControllerDoSomethingAction = {
        type: \`BazController:doSomething\`;
        handler: BazController['doSomething'];
      };

      /**
       * Union of all BazController action types.
       */
      export type BazControllerMethodActions = BazControllerDoSomethingAction;
      "
    `);
  });

  it('includes JSDoc comments when present', async () => {
    const controller: SourceInfo = {
      name: 'FooController',
      filePath: '/some/path/FooController.ts',

      methods: [
        {
          name: 'doSomething',
          jsDoc: '/**\n * Does something.\n */',
        },
      ],
    };

    const result = await generateActionTypesContent(controller, 'prettier');

    expect(result).toContain('/**\n * Does something.\n */');
  });

  it('generates no union type for controllers with no methods', async () => {
    const controller: SourceInfo = {
      name: 'EmptyController',
      filePath: '/some/path/EmptyController.ts',

      methods: [],
    };

    const result = await generateActionTypesContent(controller, 'prettier');

    expect(result).not.toContain('EmptyControllerMethodActions');
  });
});
