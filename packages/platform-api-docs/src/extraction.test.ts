import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { extractFromFile } from './extraction';

const { withinSandbox } = createSandbox('platform-api-docs/extraction');

/**
 * Append a synthetic `*Messenger` declaration to a fixture so that the action
 * and event types under test are reachable via the messenger-anchored
 * extraction algorithm.
 *
 * @param body - The fixture body containing the types to extract.
 * @param options - Names of action and event types the messenger should reference.
 * @param options.actions - Action type names to list in the messenger's Actions slot.
 * @param options.events - Event type names to list in the messenger's Events slot.
 * @returns The fixture body with a trailing Messenger declaration appended.
 */
function withMessenger(
  body: string,
  options: { actions?: string[]; events?: string[] } = {},
): string {
  const actions = (options.actions ?? []).join(' | ') || 'never';
  const events = (options.events ?? []).join(' | ') || 'never';
  return `${body.trimEnd()}\nexport type TestMessenger = Messenger<'Test', ${actions}, ${events}>;\n`;
}

describe('extractFromFile', () => {
  it('extracts inline action type alias with handler', async () => {
    expect.assertions(5);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
          { actions: ['FooControllerGetStateAction'] },
        ),
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
        withMessenger(
          `
export type FooControllerStateChangeEvent = {
  type: 'FooController:stateChange';
  payload: [FooState, Patch[]];
};
`,
          { events: ['FooControllerStateChangeEvent'] },
        ),
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
        withMessenger(
          `
export interface BarControllerResetAction {
  type: 'BarController:reset';
  handler: () => void;
}
`,
          { actions: ['BarControllerResetAction'] },
        ),
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
        withMessenger(
          `
/**
 * Gets the current state of the controller.
 */
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
          { actions: ['FooControllerGetStateAction'] },
        ),
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
        withMessenger(
          `
/** Gets the state. */
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};
`,
          { actions: ['FooControllerGetStateAction'] },
        ),
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
        withMessenger(
          `
/** @deprecated Use getState instead. */
export type FooControllerOldAction = {
  type: 'FooController:old';
  handler: () => void;
};
`,
          { actions: ['FooControllerOldAction'] },
        ),
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

  it('ignores action-shaped types that are not referenced by any Messenger', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Both types share the same action-like shape, but only the first is
      // referenced by the messenger. The second should be ignored as a
      // potential false positive.
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
export type RealAction = {
  type: 'Foo:real';
  handler: () => void;
};

export type LookalikeAction = {
  type: 'Foo:lookalike';
  handler: () => void;
};
`,
          { actions: ['RealAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('RealAction');
    });
  });

  it('expands union-type aliases referenced by a Messenger', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The messenger references the umbrella union, not the individual
      // actions directly. The walk should descend through the union.
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

export type FooActions = FooGetAction | FooSetAction;

export type FooMessenger = Messenger<'Foo', FooActions, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(2);
      expect(items.map((item) => item.typeName).sort()).toStrictEqual([
        'FooGetAction',
        'FooSetAction',
      ]);
      expect(items.every((item) => item.kind === 'action')).toBe(true);
    });
  });

  it('resolves handler from class method signature', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
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
          { actions: ['FooControllerDoStuffAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(x: string) => boolean');
    });
  });

  it('resolves handler from double-quoted indexed access', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff(x: string): boolean {
    return x.length > 0;
  }
}

export type FooControllerDoStuffAction = {
  type: 'FooController:doStuff';
  handler: FooController["doStuff"];
};
`,
          { actions: ['FooControllerDoStuffAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(x: string) => boolean');
    });
  });

  it('resolves handler from template-literal indexed access', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          [
            'class FooController {',
            '  doStuff(x: string): boolean {',
            '    return x.length > 0;',
            '  }',
            '}',
            '',
            'export type FooControllerDoStuffAction = {',
            "  type: 'FooController:doStuff';",
            '  handler: FooController[`doStuff`];',
            '};',
          ].join('\n'),
          { actions: ['FooControllerDoStuffAction'] },
        ),
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
        withMessenger(
          `export type FooAction = {
  type: 'Foo:bar';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
          `
/**
 * Returns an object like {foo: bar}.
 */
export type FooAction = {
  type: 'Foo:bar';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
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
          {
            actions: ['FooGetAction', 'FooSetAction'],
            events: ['FooChangeEvent'],
          },
        ),
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
        withMessenger(
          `
const controllerName = 'MyController';

export type MyControllerGetAction = {
  type: \`\${typeof controllerName}:get\`;
  handler: () => void;
};
`,
          { actions: ['MyControllerGetAction'] },
        ),
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
        withMessenger(
          `
import { CONTROLLER_NAME } from './constants';

export type ImportedControllerGetAction = {
  type: \`\${typeof CONTROLLER_NAME}:get\`;
  handler: () => void;
};
`,
          { actions: ['ImportedControllerGetAction'] },
        ),
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
        withMessenger(
          `
/**
 * See {@link FooController} for details.
 */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('`FooController`');
    });
  });

  it('extracts @param and @returns tags into structured fields', async () => {
    expect.assertions(5);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
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
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      // Description body keeps the prose above the first tag.
      expect(items[0].jsDoc).toContain('Does something important.');
      // Tags are pulled out of the description body.
      expect(items[0].jsDoc).not.toContain('@param');
      expect(items[0].jsDoc).not.toContain('@returns');
      // And surfaced as structured fields instead.
      expect(items[0].params).toStrictEqual([
        { name: 'x', description: 'The input.' },
      ]);
      expect(items[0].returns).toBe('The output.');
    });
  });

  it('extracts deprecated text from JSDoc', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
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
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
          `
export type DeclaredGetAction = {
  type: 'Declared:get';
  handler: () => string;
};
`,
          { actions: ['DeclaredGetAction'] },
        ),
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
        withMessenger(
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
          { actions: ['MyCtrlFetchAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(id: number)');
    });
  });

  it('inherits @param and @returns from the resolved class method when the type alias has no JSDoc', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
class MyCtrl {
  /**
   * Fetches data.
   *
   * @param id - The id to fetch.
   * @returns The fetched data.
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
          { actions: ['MyCtrlFetchAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Fetches data.');
      expect(items[0].params).toStrictEqual([
        { name: 'id', description: 'The id to fetch.' },
      ]);
      expect(items[0].returns).toBe('The fetched data.');
    });
  });

  it('prefers the type alias\\u2019s own @param/@returns over the resolved method\\u2019s', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
class MyCtrl {
  /**
   * Method doc.
   *
   * @param id - From the method.
   * @returns From the method.
   */
  fetchData(id: number): Promise<string> {
    return Promise.resolve('');
  }
}

/**
 * Type-alias doc.
 *
 * @param id - From the alias.
 * @returns From the alias.
 */
export type MyCtrlFetchAction = {
  type: 'MyCtrl:fetchData';
  handler: MyCtrl['fetchData'];
};
`,
          { actions: ['MyCtrlFetchAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].params[0].description).toBe('From the alias.');
      expect(items[0].returns).toBe('From the alias.');
    });
  });

  it('extracts const with as const assertion', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
const cn = 'AsConst' as const;

export type AsConstGetAction = {
  type: \`\${typeof cn}:get\`;
  handler: () => void;
};
`,
          { actions: ['AsConstGetAction'] },
        ),
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
        withMessenger(
          `
declare const controllerName: "DeclaredConst";

export type DeclaredConstGetAction = {
  type: \`\${typeof controllerName}:get\`;
  handler: () => void;
};
`,
          { actions: ['DeclaredConstGetAction'] },
        ),
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
        withMessenger(
          `
import { CN } from './constants.cjs';

export type ImportedDtsGetAction = {
  type: \`\${typeof CN}:get\`;
  handler: () => void;
};
`,
          { actions: ['ImportedDtsGetAction'] },
        ),
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
        withMessenger(
          `
const controllerName = 'MyCtrl';

type ControllerGetStateAction<T, S> = {
  type: \`\${T & string}:getState\`;
  handler: () => S;
};

export type MyCtrlGetStateAction = ControllerGetStateAction<typeof controllerName, MyState>;
`,
          { actions: ['MyCtrlGetStateAction'] },
        ),
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
        withMessenger(
          `
type ControllerGetStateAction<T, S> = {
  type: \`\${T & string}:getState\`;
  handler: () => S;
};

export type LitGetStateAction = ControllerGetStateAction<'LitCtrl', LitState>;
`,
          { actions: ['LitGetStateAction'] },
        ),
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
        withMessenger(
          `
const controllerName = 'MyCtrl';

type ControllerStateChangeEvent<T, S> = {
  type: \`\${T & string}:stateChange\`;
  payload: [S, Patch[]];
};

export type MyCtrlStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, MyState>;
`,
          { events: ['MyCtrlStateChangeEvent'] },
        ),
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
        withMessenger(
          `
type ControllerStateChangeEvent<T, S> = {
  type: \`\${T & string}:stateChange\`;
  payload: [S, Patch[]];
};

export type LitStateChangeEvent = ControllerStateChangeEvent<'LitCtrl', LitState>;
`,
          { events: ['LitStateChangeEvent'] },
        ),
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
        withMessenger(
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
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
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
          { actions: ['OldAction'] },
        ),
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
        withMessenger(
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
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
          [
            '',
            '/**',
            ' *Some text without space after asterisk.',
            ' */',
            "export type FooAction = { type: 'Foo:do'; handler: () => void; };",
            '',
          ].join('\n'),
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
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
          { actions: ['MyCtrlDoAction'] },
        ),
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
        withMessenger(
          `
/**
 * Returns \`{foo: bar}\` result.
 */
export type FooAction = {
  type: 'Foo:get';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
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
        withMessenger(
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
          { actions: ['OldAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('**Deprecated:** Use v2.');
      expect(items[0].jsDoc).toContain('Some remaining text.');
    });
  });

  it('ignores types that look like Messenger but are not type references', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The walker bails out for anything that isn't `Messenger<...>` —
      // including bare aliases like `type FooMessenger = string`. Adding
      // such a type should not produce any capability docs.
      await fs.promises.writeFile(
        filePath,
        `
export type FooMessenger = string;

export type ShouldNotShowAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toStrictEqual([]);
    });
  });

  it('ignores Messenger types with fewer than three type arguments', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The current `Messenger<Namespace, Actions, Events>` shape requires
      // three type arguments. A two-arg `Messenger<A, E>` (legacy form) is
      // not supported and should be skipped silently.
      await fs.promises.writeFile(
        filePath,
        `
export type FooMessenger = Messenger<Actions, Events>;

export type ShouldNotShowAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toStrictEqual([]);
    });
  });

  it('ignores union members that are not type references', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // `never` inside an Actions union is a `KeywordTypeNode` (not a
      // `TypeReference`); the walker should skip it without throwing and
      // still document the real action sitting next to it.
      await fs.promises.writeFile(
        filePath,
        `
export type FooGetAction = {
  type: 'Foo:get';
  handler: () => void;
};

export type FooMessenger = Messenger<'Foo', FooGetAction | never, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('FooGetAction');
    });
  });

  it('handles capability types where the `type` property is not declared first', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // `handler` is declared before `type`, exercising the property-search
      // loop's "this isn't the one we want, keep looking" branch.
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
export type FooAction = {
  handler: () => void;
  type: 'Foo:do';
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('Foo:do');
    });
  });

  it('follows umbrella-union imports into sibling files to find capability types', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      // Auto-generated sibling file with the actual action types.
      await fs.promises.writeFile(
        path.join(directoryPath, 'method-action-types.ts'),
        `
export type FooAddAction = {
  type: 'Foo:add';
  handler: () => void;
};

export type FooRemoveAction = {
  type: 'Foo:remove';
  handler: () => void;
};

export type FooMethodActions = FooAddAction | FooRemoveAction;
`,
      );

      const filePath = path.join(directoryPath, 'FooController.ts');
      // Main file imports the umbrella union and uses it in the messenger.
      await fs.promises.writeFile(
        filePath,
        `
import type { FooMethodActions } from './method-action-types';

export type FooMessenger = Messenger<'Foo', FooMethodActions, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(2);
      expect(items.map((item) => item.typeName).sort()).toStrictEqual([
        'FooAddAction',
        'FooRemoveAction',
      ]);
      // Source paths come from where the types actually live (the sibling
      // file), not from where the messenger is declared.
      expect(items[0].sourceFile).toBe('method-action-types.ts');
    });
  });

  it('ignores externally-declared action references that are not local to the file', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // `AllowedActions` is imported from elsewhere; the walker reaches its
      // name as a leaf but it has no local declaration to resolve, so the
      // extractor should ignore it without crashing.
      await fs.promises.writeFile(
        filePath,
        `
import type { AllowedActions } from '@metamask/other';

export type LocalAction = {
  type: 'Local:do';
  handler: () => void;
};

export type LocalMessenger = Messenger<'Local', LocalAction | AllowedActions, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      // Only the locally-declared action is documented; the imported name
      // is left alone (and will be documented from its home package).
      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('LocalAction');
    });
  });

  it('does not double-extract a capability referenced by two messengers', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Two messengers both reference the same action type; extraction
      // should produce exactly one item.
      await fs.promises.writeFile(
        filePath,
        `
export type SharedAction = {
  type: 'Shared:do';
  handler: () => void;
};

export type FirstMessenger = Messenger<'First', SharedAction, never>;
export type SecondMessenger = Messenger<'Second', SharedAction, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('SharedAction');
    });
  });

  it('ignores capability-type-constructor aliases whose name does not match', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The Messenger references a type that resolves to a generic with an
      // unknown constructor name — neither inline shape nor a recognized
      // helper, so nothing is extracted.
      await fs.promises.writeFile(
        filePath,
        `
type SomeUnrelatedHelper<T, S> = { type: T; state: S };

export type WeirdAction = SomeUnrelatedHelper<'Weird:do', WeirdState>;

export type WeirdMessenger = Messenger<'Weird', WeirdAction, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toStrictEqual([]);
    });
  });

  it('ignores capability-type-constructor aliases with insufficient type arguments', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // ControllerGetStateAction is the recognized name, but here it only
      // has one type argument — extraction should bail rather than guess.
      await fs.promises.writeFile(
        filePath,
        `
type ControllerGetStateAction<T> = { type: T; handler: () => void };

export type ShortAction = ControllerGetStateAction<'Short'>;

export type ShortMessenger = Messenger<'Short', ShortAction, never>;
`,
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toStrictEqual([]);
    });
  });

  it('skips `.json` imports without trying to chase them', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Real-world pattern: `import pkg from '../package.json'`. The
      // resolver shouldn't try to resolve such imports as TS files.
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
import packageJson from './package.json';

export type FooAction = {
  type: 'Foo:do';
  handler: () => typeof packageJson;
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('FooAction');
    });
  });

  it('skips imports whose candidate paths do not exist on disk', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Relative import points to a missing file — the resolver should
      // continue past every candidate without throwing.
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
import { MISSING } from './does-not-exist';

export type FooAction = {
  type: 'Foo:do';
  handler: () => typeof MISSING;
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
    });
  });

  it('ignores destructured `const` declarations', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Binding patterns aren't named constants; the resolver should
      // simply skip them rather than crash.
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
const { x } = { x: 'IgnoredViaDestructure' };

export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
    });
  });

  it('skips non-relative imports when resolving constants', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
import { something } from 'external-package';

export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items).toHaveLength(1);
    });
  });

  it('captures multi-line @param tags as structured params and keeps the description', async () => {
    expect.assertions(4);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          `
/**
 * Main description.
 *
 * @param foo - First param that
 *   spans multiple lines.
 * @param bar - Second param.
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Main description.');
      expect(items[0].jsDoc).not.toContain('@param');
      expect(items[0].params).toHaveLength(2);
      expect(items[0].params[0]).toStrictEqual({
        name: 'foo',
        description: 'First param that spans multiple lines.',
      });
    });
  });

  it('handles deprecated followed by another tag', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
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
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('**Deprecated:** Use v2.');
      expect(items[0].jsDoc).not.toContain('@param');
    });
  });

  it('handles curly braces in multi-line JSDoc outside backticks', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
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
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('\\{name: string, age: number\\}');
    });
  });

  it('handles JSDoc with only asterisk line', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      await fs.promises.writeFile(
        filePath,
        withMessenger(
          [
            '/**',
            ' *',
            ' * Text after empty asterisk.',
            ' */',
            "export type FooAction = { type: 'Foo:do'; handler: () => void; };",
          ].join('\n'),
          { actions: ['FooAction'] },
        ),
      );

      const items = await extractFromFile(filePath, directoryPath);

      expect(items[0].jsDoc).toContain('Text after empty asterisk.');
    });
  });
});
