import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { extractFromFile } from './extraction';

const { withinSandbox } = createSandbox('messenger-cli/docs-extraction');

describe('extractFromFile', () => {
  it('extracts inline action type alias with handler', async () => {
    expect.assertions(5);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('FooControllerGetStateAction');
      expect(items[0].typeString).toBe('FooController:getState');
      expect(items[0].kind).toBe('action');
      expect(items[0].handlerOrPayload).toContain('() => FooState');
    });
  });

  it('extracts inline event type alias with payload', async () => {
    expect.assertions(4);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
export type FooControllerStateChangeEvent = {
  type: 'FooController:stateChange';
  payload: [FooState, Patch[]];
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('FooController:stateChange');
      expect(items[0].kind).toBe('event');
      expect(items[0].handlerOrPayload).toContain('[FooState, Patch[]]');
    });
  });

  it('extracts interface-based action definition', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
export interface BarControllerResetAction {
  type: 'BarController:reset';
  handler: () => void;
}
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('BarController:reset');
      expect(items[0].kind).toBe('action');
    });
  });

  it('extracts JSDoc text from type alias', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Gets the current state of the controller.
 */
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].jsDoc).toContain(
        'Gets the current state of the controller.',
      );
    });
  });

  it('extracts single-line JSDoc', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/** Gets the state. */
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].jsDoc).toBe('Gets the state.');
    });
  });

  it('marks deprecated types', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/** @deprecated Use getState instead. */
export type FooControllerOldAction = {
  type: 'FooController:old';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].deprecated).toBe(true);
    });
  });

  it('returns empty array for files with no messenger types', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'utils.ts');
      await fs.promises.writeFile(
        filePath,
        `
export function add(a: number, b: number): number {
  return a + b;
}
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toStrictEqual([]);
    });
  });

  it('resolves handler from class method signature', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
class FooController {
  doStuff(x: string): boolean {
    return x.length > 0;
  }
}

export type FooControllerDoStuffAction = {
  type: 'FooController:doStuff';
  handler: FooController['doStuff'];
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(x: string) => boolean');
    });
  });

  it('includes source file path and line number', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `export type FooAction = {
  type: 'Foo:bar';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].sourceFile).toBe('types.ts');
    });
  });

  it('escapes curly braces in JSDoc for MDX safety', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Returns an object like {foo: bar}.
 */
export type FooAction = {
  type: 'Foo:bar';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].jsDoc).toContain('\\{foo: bar\\}');
    });
  });

  it('extracts multiple types from the same file', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
export type FooGetAction = {
  type: 'Foo:get';
  handler: () => string;
};

export type FooSetAction = {
  type: 'Foo:set';
  handler: (v: string) => void;
};

export type FooChangeEvent = {
  type: 'Foo:change';
  payload: [string];
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(3);
      expect(items.filter((i) => i.kind === 'action')).toHaveLength(2);
      expect(items.filter((i) => i.kind === 'event')).toHaveLength(1);
    });
  });

  it('resolves template literal type strings with constants', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
const controllerName = 'MyController';

export type MyControllerGetAction = {
  type: \`\${typeof controllerName}:get\`;
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('MyController:get');
    });
  });

  it('resolves controller name from imported constants', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'constants.ts'),
        `export const CONTROLLER_NAME = 'ImportedController';`,
      );

      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
import { CONTROLLER_NAME } from './constants';

export type ImportedControllerGetAction = {
  type: \`\${typeof CONTROLLER_NAME}:get\`;
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('ImportedController:get');
    });
  });

  it('extracts JSDoc with @link references', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * See {@link FooController} for details.
 */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('`FooController`');
    });
  });

  it('strips @param and @returns tags from JSDoc', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Does something important.
 *
 * @param x - The input.
 * @returns The output.
 */
export type FooAction = {
  type: 'Foo:do';
  handler: (x: string) => string;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Does something important.');
      expect(items[0].jsDoc).not.toContain('@param');
      expect(items[0].jsDoc).not.toContain('@returns');
    });
  });

  it('extracts deprecated text from JSDoc', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Old method.
 * @deprecated Use newMethod instead.
 */
export type FooAction = {
  type: 'Foo:old';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].deprecated).toBe(true);
      expect(items[0].jsDoc).toContain('**Deprecated:**');
    });
  });

  it('extracts from .d.cts declaration files', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'index.d.cts');
      await fs.promises.writeFile(
        filePath,
        `
export type DeclaredGetAction = {
  type: 'Declared:get';
  handler: () => string;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('Declared:get');
    });
  });

  it('handles class method JSDoc in handler resolution', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
class MyCtrl {
  /**
   * Fetches data from server.
   */
  fetchData(id: number): Promise<string> {
    return Promise.resolve('');
  }
}

export type MyCtrlFetchAction = {
  type: 'MyCtrl:fetchData';
  handler: MyCtrl['fetchData'];
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(id: number)');
    });
  });

  it('extracts const with as const assertion', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
const cn = 'AsConst' as const;

export type AsConstGetAction = {
  type: \`\${typeof cn}:get\`;
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('AsConst:get');
    });
  });

  it('extracts declare const from .d.cts files', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'index.d.cts');
      await fs.promises.writeFile(
        filePath,
        `
declare const controllerName: "DeclaredConst";

export type DeclaredConstGetAction = {
  type: \`\${typeof controllerName}:get\`;
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('DeclaredConst:get');
    });
  });

  it('resolves imported constants from .d.cts files', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'constants.d.cts'),
        `export declare const CN: "ImportedDts";`,
      );

      const filePath = path.join(directoryPath, 'types.d.cts');
      await fs.promises.writeFile(
        filePath,
        `
import { CN } from './constants.cjs';

export type ImportedDtsGetAction = {
  type: \`\${typeof CN}:get\`;
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('ImportedDts:get');
    });
  });

  it('extracts ControllerGetStateAction pattern', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
const controllerName = 'MyCtrl';

type ControllerGetStateAction<T, S> = {
  type: \`\${T & string}:getState\`;
  handler: () => S;
};

export type MyCtrlGetStateAction = ControllerGetStateAction<typeof controllerName, MyState>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('MyCtrl:getState');
      expect(items[0].kind).toBe('action');
    });
  });

  it('extracts ControllerGetStateAction with string literal arg', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
type ControllerGetStateAction<T, S> = {
  type: \`\${T & string}:getState\`;
  handler: () => S;
};

export type LitGetStateAction = ControllerGetStateAction<'LitCtrl', LitState>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('LitCtrl:getState');
    });
  });

  it('extracts ControllerStateChangeEvent pattern', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
const controllerName = 'MyCtrl';

type ControllerStateChangeEvent<T, S> = {
  type: \`\${T & string}:stateChange\`;
  payload: [S, Patch[]];
};

export type MyCtrlStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, MyState>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('MyCtrl:stateChange');
      expect(items[0].kind).toBe('event');
    });
  });

  it('extracts ControllerStateChangeEvent with string literal arg', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
type ControllerStateChangeEvent<T, S> = {
  type: \`\${T & string}:stateChange\`;
  payload: [S, Patch[]];
};

export type LitStateChangeEvent = ControllerStateChangeEvent<'LitCtrl', LitState>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('LitCtrl:stateChange');
    });
  });

  it('handles JSDoc with @see and @throws tags (stripped)', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Does something.
 *
 * @see OtherController
 * @throws Error if invalid.
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Does something.');
      expect(items[0].jsDoc).not.toContain('@see');
      expect(items[0].jsDoc).not.toContain('@throws');
    });
  });

  it('handles multi-line deprecated text', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Old action.
 *
 * @deprecated Use newAction instead.
 * This will be removed in v2.
 */
export type OldAction = {
  type: 'Old:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain(
        '**Deprecated:** Use newAction instead. This will be removed in v2.',
      );
    });
  });

  it('handles JSDoc with empty * lines', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * First paragraph.
 *
 * Second paragraph.
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('First paragraph.');
    });
  });

  it('handles JSDoc with asterisk-only lines', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        [
          '',
          '/**',
          ' *Some text without space after asterisk.',
          ' */',
          "export type FooAction = { type: 'Foo:do'; handler: () => void; };",
          '',
        ].join('\n'),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain(
        'Some text without space after asterisk.',
      );
    });
  });

  it('skips class members that are not methods', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
class MyCtrl {
  name = 'foo';
  doStuff(): void {}
}

export type MyCtrlDoAction = {
  type: 'MyCtrl:doStuff';
  handler: MyCtrl['doStuff'];
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
    });
  });

  it('handles curly braces inside backtick spans (not escaped)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Returns \`{foo: bar}\` result.
 */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      // Braces inside backticks should NOT be escaped
      expect(items[0].jsDoc).toContain('`{foo: bar}`');
    });
  });

  it('handles deprecated tag followed by empty line', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * @deprecated Use v2.
 *
 * Some remaining text.
 */
export type OldAction = {
  type: 'Old:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('**Deprecated:** Use v2.');
      expect(items[0].jsDoc).toContain('Some remaining text.');
    });
  });

  it('skips non-relative imports when resolving constants', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
import { something } from 'external-package';

export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
    });
  });

  it('handles skipped tag continuation lines', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Main description.
 *
 * @param foo - First param that
 *   spans multiple lines.
 * @param bar - Second param.
 *
 * After params.
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Main description.');
      expect(items[0].jsDoc).toContain('After params.');
    });
  });

  it('handles deprecated followed by another tag', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * @deprecated Use v2.
 * @param x - Input.
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('**Deprecated:** Use v2.');
      expect(items[0].jsDoc).not.toContain('@param');
    });
  });

  it('handles curly braces in multi-line JSDoc outside backticks', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Returns an object.
 *
 * Shape: {name: string, age: number}
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('\\{name: string, age: number\\}');
      expect(items[0].jsDoc).not.toContain('{name');
    });
  });

  it('handles JSDoc with only asterisk line', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        [
          '/**',
          ' *',
          ' * Text after empty asterisk.',
          ' */',
          "export type FooAction = { type: 'Foo:do'; handler: () => void; };",
        ].join('\n'),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Text after empty asterisk.');
    });
  });

  it('skips class members that are not methods', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
class MyCtrl {
  name = 'foo';
  doStuff(): void {}
}

export type MyCtrlDoAction = {
  type: 'MyCtrl:doStuff';
  handler: MyCtrl['doStuff'];
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
    });
  });

  it('handles curly braces inside backtick spans (not escaped)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        `
/**
 * Returns \`{foo: bar}\` result.
 */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      // Braces inside backticks should NOT be escaped
      expect(items[0].jsDoc).toContain('`{foo: bar}`');
    });
  });
});
