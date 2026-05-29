import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { createExtractionProject, extractFromSourceFile } from './extraction';
import { MessengerCapabilityPacket } from './types';

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

/**
 * Write `content` to `filePath`, then load that file (and any sibling `.ts` /
 * `.d.cts` files in the same directory) into a fresh extraction project and
 * run `extractFromSourceFile` on it.
 *
 * This mirrors the logic that callers of the library use in production (via
 * `createExtractionProject` + `extractFromSourceFile`) without going through
 * the now-removed `extractFromFile` convenience wrapper.
 *
 * @param filePath - Absolute path of the file to write and extract from.
 * @param content - TypeScript source to write to that file.
 * @param projectPath - Base path for computing relative source paths in the
 * returned packets.
 * @returns The extracted capability packets.
 */
async function extractFromWrittenFile(
  filePath: string,
  content: string,
  projectPath: string,
): Promise<MessengerCapabilityPacket[]> {
  await fs.promises.writeFile(filePath, content);
  const parentDir = path.dirname(filePath);
  const project = createExtractionProject();
  project.addSourceFilesAtPaths([
    path.join(parentDir, '**/*.ts'),
    path.join(parentDir, '**/*.d.cts'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const sourceFile = project.getSourceFile(filePath)!;
  return extractFromSourceFile(sourceFile, projectPath);
}

describe('extractFromSourceFile', () => {
  it('extracts inline action type alias with handler', async () => {
    expect.assertions(5);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('BarController:reset');
      expect(items[0].kind).toBe('action');
    });
  });

  it('extracts JSDoc text from type alias', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].jsDoc).toBe('Gets the state.');
    });
  });

  it('marks deprecated types', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].deprecated).toBe(true);
    });
  });

  it('returns empty array for files with no messenger types', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'utils.ts');

      const items = await extractFromWrittenFile(
        filePath,
        `
export function add(a: number, b: number): number {
  return a + b;
}
`,
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('RealAction');
    });
  });

  it('descends into a single-member umbrella alias (e.g. `*MethodActions = OneAction`) to extract the underlying capability', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      // Mirrors the auto-generated `*-method-action-types.ts` pattern when
      // a controller exposes exactly one method via the bulk-registration
      // helper: `type FooControllerMethodActions = FooControllerDoAction;`.
      // The alias body is a bare TypeReference with no type arguments — the
      // walker must recurse into it rather than treating it as a plain
      // re-export, otherwise `FooControllerDoAction` is dropped from the
      // top-level union and never documented.
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
        filePath,
        `
export type FooControllerDoAction = {
  type: 'FooController:do';
  handler: () => void;
};

export type FooControllerMethodActions = FooControllerDoAction;

export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => Record<string, unknown>;
};

export type FooControllerActions =
  | FooControllerGetStateAction
  | FooControllerMethodActions;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  never
>;
`,
        directoryPath,
      );

      expect(items).toHaveLength(2);
      expect(items.map((item) => item.typeString).sort()).toStrictEqual([
        'FooController:do',
        'FooController:getState',
      ]);
    });
  });

  it('descends into a bare-TypeReference alias without double-documenting the target when the same action is reached two ways', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The messenger's actions slot references both the direct action and a
      // plain alias of it. The alias has no type arguments — it's a bare
      // re-export — and should be skipped so the action isn't documented
      // twice from the same file.

      const items = await extractFromWrittenFile(
        filePath,
        `
export type SharedAction = {
  type: 'Test:get';
  handler: () => string;
};

export type AliasOfShared = SharedAction;

export type TestMessenger = Messenger<'Test', SharedAction | AliasOfShared, never>;
`,
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('SharedAction');
    });
  });

  it('expands union-type aliases referenced by a Messenger', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The messenger references the umbrella union, not the individual
      // actions directly. The walk should descend through the union.

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(x: string) => boolean');
    });
  });

  it('marks optional parameters with `?` in the resolved handler signature', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff(x: string, y?: number): boolean {
    return x.length > (y ?? 0);
  }
}

export type FooControllerDoStuffAction = {
  type: 'FooController:doStuff';
  handler: FooController['doStuff'];
};
`,
          { actions: ['FooControllerDoStuffAction'] },
        ),
        directoryPath,
      );

      expect(items[0].handlerOrPayload).toContain('y?: number');
    });
  });

  it('preserves the `...` spread on rest parameters in the resolved handler signature', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      // `param.getNameNode().getText()` returns just the identifier, dropping
      // the `...` token — without an explicit `isRestParameter` check the
      // rendered signature is parsed as a positional array argument rather
      // than varargs.
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff(...args: string[]): boolean {
    return args.length > 0;
  }
}

export type FooControllerDoStuffAction = {
  type: 'FooController:doStuff';
  handler: FooController['doStuff'];
};
`,
          { actions: ['FooControllerDoStuffAction'] },
        ),
        directoryPath,
      );

      expect(items[0].handlerOrPayload).toContain('...args: string[]');
    });
  });

  it('resolves handler from double-quoted indexed access', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(x: string) => boolean');
    });
  });

  it('resolves handler from template-literal indexed access', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(x: string) => boolean');
    });
  });

  it('includes source file path and line number', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `export type FooAction = {
  type: 'Foo:bar';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].sourceFile).toBe('types.ts');
    });
  });

  it('escapes curly braces in JSDoc for MDX safety', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].jsDoc).toContain('\\{foo: bar\\}');
    });
  });

  it('extracts multiple types from the same file', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(3);
      expect(items.filter((i) => i.kind === 'action')).toHaveLength(2);
      expect(items.filter((i) => i.kind === 'event')).toHaveLength(1);
    });
  });

  it('resolves template literal type strings with constants', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('ImportedController:get');
    });
  });

  it('extracts JSDoc with @link references', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain('`FooController`');
    });
  });

  it('extracts @param and @returns tags into structured fields', async () => {
    expect.assertions(5);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].deprecated).toBe(true);
      expect(items[0].jsDoc).toContain('**Deprecated:**');
    });
  });

  it('extracts from .d.cts declaration files', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'index.d.cts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('Declared:get');
    });
  });

  it('handles class method JSDoc in handler resolution', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('(id: number)');
    });
  });

  it('does not inherit JSDoc from a resolved class method (action page reflects only the type alias)', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toBe('');
      expect(items[0].params).toStrictEqual([]);
      expect(items[0].returns).toBe('');
    });
  });

  it('extracts const with as const assertion', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('AsConst:get');
    });
  });

  it('extracts declare const from .d.cts files', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'index.d.cts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('ImportedDts:get');
    });
  });

  it('extracts ControllerGetStateAction pattern', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('MyCtrl:getState');
      expect(items[0].kind).toBe('action');
    });
  });

  it('extracts ControllerGetStateAction with string literal arg', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('LitCtrl:getState');
    });
  });

  it('extracts ControllerStateChangeEvent pattern', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('MyCtrl:stateChange');
      expect(items[0].kind).toBe('event');
    });
  });

  it('extracts ControllerStateChangeEvent with string literal arg', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('LitCtrl:stateChange');
    });
  });

  it('handles JSDoc with @see and @throws tags (stripped)', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain('Does something.');
      expect(items[0].jsDoc).not.toContain('@see');
      expect(items[0].jsDoc).not.toContain('@throws');
    });
  });

  it('handles multi-line deprecated text', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain(
        '**Deprecated:** Use newAction instead. This will be removed in v2.',
      );
    });
  });

  it('handles JSDoc with empty * lines', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain('First paragraph.');
    });
  });

  it('handles JSDoc with asterisk-only lines', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain(
        'Some text without space after asterisk.',
      );
    });
  });

  it('skips class members that are not methods', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
    });
  });

  it('handles curly braces inside backtick spans (not escaped)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      // Braces inside backticks should NOT be escaped
      expect(items[0].jsDoc).toContain('`{foo: bar}`');
    });
  });

  it('handles deprecated tag followed by empty line', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
        filePath,
        `
export type FooMessenger = string;

export type ShouldNotShowAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
        filePath,
        `
export type FooMessenger = Messenger<Actions, Events>;

export type ShouldNotShowAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
        filePath,
        `
export type FooGetAction = {
  type: 'Foo:get';
  handler: () => void;
};

export type FooMessenger = Messenger<'Foo', FooGetAction | never, never>;
`,
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
        filePath,
        `
import type { FooMethodActions } from './method-action-types';

export type FooMessenger = Messenger<'Foo', FooMethodActions, never>;
`,
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
        filePath,
        `
import type { AllowedActions } from '@metamask/other';

export type LocalAction = {
  type: 'Local:do';
  handler: () => void;
};

export type LocalMessenger = Messenger<'Local', LocalAction | AllowedActions, never>;
`,
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
        filePath,
        `
export type SharedAction = {
  type: 'Shared:do';
  handler: () => void;
};

export type FirstMessenger = Messenger<'First', SharedAction, never>;
export type SecondMessenger = Messenger<'Second', SharedAction, never>;
`,
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('SharedAction');
    });
  });

  it('skips an interface that is referenced by a Messenger but has no `type` property', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // An interface that is missing the `type` property cannot produce a type
      // string. The literal extractor returns null, and the constructor
      // extractor also returns null (because it only handles type aliases).

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export interface FooAction {
  handler: () => void;
}
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('skips a capability-type-constructor alias whose body is a qualified-name constructor reference', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'helpers.ts'),
        `
export type ControllerGetStateAction<T, S> = {
  type: \`\${T & string}:getState\`;
  handler: () => S;
};
`,
      );

      const filePath = path.join(directoryPath, 'types.ts');
      // A namespace import produces a qualified-name reference on the right-
      // hand side of the alias body (`Helpers.ControllerGetStateAction<...>`).
      // The walker cannot resolve qualified-name constructor references and
      // should skip the slot without crashing, leaving no items.

      const items = await extractFromWrittenFile(
        filePath,
        `
import * as Helpers from './helpers';

export type LocalAction = {
  type: 'Local:do';
  handler: () => void;
};

export type QualifiedAction = Helpers.ControllerGetStateAction<'Foo', object>;

export type LocalMessenger = Messenger<'Local', LocalAction | QualifiedAction, never>;
`,
        directoryPath,
      );

      expect(items).toHaveLength(1);
    });
  });

  it('ignores capability-type-constructor aliases whose name does not match', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The Messenger references a type that resolves to a generic with an
      // unknown constructor name — neither inline shape nor a recognized
      // helper, so nothing is extracted.

      const items = await extractFromWrittenFile(
        filePath,
        `
type SomeUnrelatedHelper<T, S> = { type: T; state: S };

export type WeirdAction = SomeUnrelatedHelper<'Weird:do', WeirdState>;

export type WeirdMessenger = Messenger<'Weird', WeirdAction, never>;
`,
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('skips a capability-type-constructor alias whose first type argument is not a string literal', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // The recognized constructor name is used, but the first type argument
      // resolves to `number` (not a string literal), so nothing is extracted.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
type ControllerGetStateAction<T, S> = {
  type: \`\${T & string}:getState\`;
  handler: () => S;
};

export type WeirdAction = ControllerGetStateAction<number, WeirdState>;
`,
          { actions: ['WeirdAction'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('ignores capability-type-constructor aliases with insufficient type arguments', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // ControllerGetStateAction is the recognized name, but here it only
      // has one type argument — extraction should bail rather than guess.

      const items = await extractFromWrittenFile(
        filePath,
        `
type ControllerGetStateAction<T> = { type: T; handler: () => void };

export type ShortAction = ControllerGetStateAction<'Short'>;

export type ShortMessenger = Messenger<'Short', ShortAction, never>;
`,
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('skips `.json` imports without trying to chase them', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Real-world pattern: `import pkg from '../package.json'`. The
      // resolver shouldn't try to resolve such imports as TS files.

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
    });
  });

  it('ignores destructured `const` declarations', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // Binding patterns aren't named constants; the resolver should
      // simply skip them rather than crash.

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
    });
  });

  it('skips qualified-name type references (namespace imports used as Ns.Type)', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'ns.ts'),
        `
export type NsAction = {
  type: 'Ns:do';
  handler: () => void;
};
`,
      );

      const filePath = path.join(directoryPath, 'types.ts');
      // A namespace import produces a qualified-name type reference
      // (`* as Ns` then `Ns.NsAction`). The walker cannot resolve qualified
      // names and should skip the slot without crashing, leaving no items.

      const items = await extractFromWrittenFile(
        filePath,
        `
import * as Ns from './ns';

export type LocalAction = {
  type: 'Local:do';
  handler: () => void;
};

export type LocalMessenger = Messenger<'Local', LocalAction | Ns.NsAction, never>;
`,
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeName).toBe('LocalAction');
    });
  });

  it('skips non-relative imports when resolving constants', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items).toHaveLength(1);
    });
  });

  it('skips a @param tag that has no name', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // A bare `@param - description` with no parameter name is malformed JSDoc.
      // ts-morph parses it as a JSDocParameterTag whose nameNode.getText() is
      // an empty string. The extractor should skip it rather than emit a param
      // entry with an empty name.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
/**
 * Does something.
 * @param - no name here
 */
export type FooAction = {
  type: 'Foo:do';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].params).toStrictEqual([]);
    });
  });

  it('captures multi-line @param tags as structured params and keeps the description', async () => {
    expect.assertions(4);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

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

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain('**Deprecated:** Use v2.');
      expect(items[0].jsDoc).not.toContain('@param');
    });
  });

  it('handles curly braces in multi-line JSDoc outside backticks', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain('\\{name: string, age: number\\}');
    });
  });

  it('handles JSDoc with only asterisk line', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
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
        directoryPath,
      );

      expect(items[0].jsDoc).toContain('Text after empty asterisk.');
    });
  });

  it('skips a type alias whose body is an intersection (not a type literal or constructor invocation)', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      // The walker captures any non-union, non-bare, non-TypeReference body
      // under `bodyShape: 'object'` and hands it to the literal extractor.
      // An intersection type like `Base & { ... }` isn't a `TypeLiteral`, so
      // the literal extractor can't read members from it and returns null.
      const filePath = path.join(directoryPath, 'types.ts');

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
type FooBase = { extra: string };
export type FooAction = FooBase & {
  type: 'Foo:get';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('handles a capability type body that contains a method signature alongside property signatures', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // A type literal can contain method signatures in addition to property
      // signatures. The method signature should be skipped while walking the
      // members, and the `type` property signature should still be found.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export type FooAction = {
  doSomething(): void;
  type: 'Foo:do';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('Foo:do');
    });
  });

  it('resolves the type string when the `type` property uses a no-substitution template literal', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // A template literal with no substitutions (e.g. `Foo:bar`) is valid
      // TypeScript. The extractor should treat it the same as a quoted string.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          [
            'export type FooAction = {',
            '  type: `Foo:bar`;',
            '  handler: () => void;',
            '};',
          ].join('\n'),
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].typeString).toBe('Foo:bar');
    });
  });

  it('skips a capability type whose `type` property uses a numeric literal type', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // `type: 42` is valid TypeScript but not a valid messenger type string.
      // The extractor should return null for this shape and produce no output.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export type FooAction = {
  type: 42;
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('skips a capability type whose body has no `type` property', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // A type alias that is referenced by a Messenger but has no `type`
      // property cannot produce a type string, so it should be skipped.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export type FooAction = {
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('renders **Deprecated:** without trailing text when @deprecated tag has no comment', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // A bare `@deprecated` tag with no explanatory text is valid JSDoc.
      // The extractor should still emit the **Deprecated:** marker.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
/**
 * Old action.
 * @deprecated
 */
export type FooAction = {
  type: 'Foo:old';
  handler: () => void;
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items[0].deprecated).toBe(true);
      expect(items[0].jsDoc).toContain('**Deprecated:**');
    });
  });

  it('falls back to `unknown` for a handler parameter that has no explicit type annotation', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // TypeScript allows untyped parameters when `noImplicitAny` is off.
      // The extractor should fall back to `unknown` rather than crashing.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff(x): boolean {
    return Boolean(x);
  }
}

export type FooControllerDoStuffAction = {
  type: 'FooController:doStuff';
  handler: FooController['doStuff'];
};
`,
          { actions: ['FooControllerDoStuffAction'] },
        ),
        directoryPath,
      );

      expect(items[0].handlerOrPayload).toContain('x: unknown');
    });
  });

  it('falls back to `void` for a handler method that has no explicit return type annotation', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // A method with an implicit return type (e.g. inferred from the body)
      // has no `ReturnTypeNode`. The extractor should fall back to `void`.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff() {}
}

export type FooControllerDoStuffAction = {
  type: 'FooController:doStuff';
  handler: FooController['doStuff'];
};
`,
          { actions: ['FooControllerDoStuffAction'] },
        ),
        directoryPath,
      );

      expect(items[0].handlerOrPayload).toContain('=> void');
    });
  });

  it('skips an inline action type that has a valid `type` string but no `handler` property', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // An action type that is missing the `handler` property cannot be
      // extracted. The extractor should skip it rather than crash.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export type FooAction = {
  type: 'Foo:do';
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('skips an inline event type that has a valid `type` string but no `payload` property', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // An event type that is missing the `payload` property cannot be
      // extracted. The extractor should skip it rather than crash.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export type FooEvent = {
  type: 'Foo:change';
};
`,
          { events: ['FooEvent'] },
        ),
        directoryPath,
      );

      expect(items).toStrictEqual([]);
    });
  });

  it('falls back to the raw handler text when the handler object type is not a simple type reference', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // When the object side of an indexed-access handler type is not a plain
      // type reference (e.g. it is an object-literal type or a built-in keyword
      // type), `resolveIndexedAccessMethod` cannot walk to a class declaration
      // and must return null. The extractor should fall back to rendering the
      // raw syntax instead.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
export type FooAction = {
  type: 'Foo:do';
  handler: { doStuff(): void }['doStuff'];
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain(
        "{ doStuff(): void }['doStuff']",
      );
    });
  });

  it('falls back to the raw handler text when the handler index is not a literal type node', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // When the index side of an indexed-access handler type is not a literal
      // (e.g. it is `keyof T`), `resolveIndexedAccessMethod` cannot determine
      // the method name and must return null. The extractor should fall back to
      // rendering the raw syntax instead.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff(): void {}
}

export type FooAction = {
  type: 'Foo:do';
  handler: FooController[keyof FooController];
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain(
        'FooController[keyof FooController]',
      );
    });
  });

  it('falls back to the raw handler text when the handler index is a numeric literal', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // When the index of an indexed-access handler type is a numeric literal
      // (e.g. `Class[0]`), the method name cannot be a valid identifier, so
      // `resolveIndexedAccessMethod` returns null and the extractor falls back
      // to the raw type text.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
type Tuple = [() => void];

export type FooAction = {
  type: 'Foo:do';
  handler: Tuple[0];
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain('Tuple[0]');
    });
  });

  it('falls back to the raw handler text when the handler class reference is a qualified name', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'controller.ts'),
        `
export class FooController {
  doStuff(): void {}
}
`,
      );

      const filePath = path.join(directoryPath, 'types.ts');
      // When the class side of a handler indexed-access type is accessed via a
      // namespace import (e.g. `NS.FooController['doStuff']`), the type name is
      // a qualified name rather than a plain identifier.
      // `resolveIndexedAccessMethod` cannot follow qualified names and returns
      // null, so the extractor falls back to the raw syntax.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
import * as NS from './controller';

export type FooAction = {
  type: 'Foo:do';
  handler: NS.FooController['doStuff'];
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain(
        "NS.FooController['doStuff']",
      );
    });
  });

  it('falls back to the raw handler text when the indexed method does not exist on the class', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      const filePath = path.join(directoryPath, 'types.ts');
      // When the method name in an indexed-access handler type does not match
      // any method declared on the class, `resolveIndexedAccessMethod` exhausts
      // all class declarations and returns null. The extractor falls back to
      // the raw type text instead of crashing.

      const items = await extractFromWrittenFile(
        filePath,
        withMessenger(
          `
class FooController {
  doStuff(): void {}
}

export type FooAction = {
  type: 'Foo:do';
  handler: FooController['nonExistentMethod'];
};
`,
          { actions: ['FooAction'] },
        ),
        directoryPath,
      );

      expect(items).toHaveLength(1);
      expect(items[0].handlerOrPayload).toContain(
        "FooController['nonExistentMethod']",
      );
    });
  });
});
