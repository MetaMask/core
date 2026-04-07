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
});
