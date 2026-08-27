import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  discoverFromRootMessengerCapabilitiesTypes,
  parseRootCapabilitiesTypeReference,
} from './root-messenger-discovery.js';

const { withinSandbox } = createSandbox(
  'platform-api-docs/root-messenger-discovery',
);

jest.setTimeout(60_000);

/**
 * A self-contained stand-in for `@metamask/messenger`'s `Messenger` type plus
 * the `MessengerActions`/`MessengerEvents` projections. Prepended to fixtures
 * that mirror the extension's derived-union shape so the fixtures resolve
 * without depending on the real package being installed in the sandbox.
 */
const MESSENGER_PRELUDE = `
type Messenger<Namespace, Actions, Events> = {
  __namespace: Namespace;
  __rootActionsTypeReference: Actions;
  __rootEventsTypeReference: Events;
};

type MessengerActions<TMessenger> =
  TMessenger extends Messenger<infer _Namespace, infer Actions, infer _Events>
    ? Actions
    : never;

type MessengerEvents<TMessenger> =
  TMessenger extends Messenger<infer _Namespace, infer _Actions, infer Events>
    ? Events
    : never;
`;

/**
 * Write a fixture file into a sandbox directory, creating parent directories
 * as needed.
 *
 * @param directoryPath - The sandbox root.
 * @param relativePath - Path of the file relative to the sandbox root.
 * @param contents - The file contents.
 */
async function writeFixture(
  directoryPath: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolutePath = path.join(directoryPath, relativePath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, contents);
}

describe('parseRootCapabilitiesTypeReference', () => {
  it('splits a "<file>#<TypeName>" reference into its parts', () => {
    expect(
      parseRootCapabilitiesTypeReference('app/core/types.ts#GlobalActions'),
    ).toStrictEqual({
      filePath: 'app/core/types.ts',
      typeName: 'GlobalActions',
    });
  });

  it('keeps "#" characters that appear in the file path portion', () => {
    expect(
      parseRootCapabilitiesTypeReference('a#b/types.ts#GlobalActions'),
    ).toStrictEqual({
      filePath: 'a#b/types.ts',
      typeName: 'GlobalActions',
    });
  });

  it('throws when the reference has no "#" separator', () => {
    expect(() =>
      parseRootCapabilitiesTypeReference('app/core/types.ts'),
    ).toThrow(
      'Expected a reference of the form "<file>#<TypeName>", got "app/core/types.ts".',
    );
  });

  it('throws when the file path portion is empty', () => {
    expect(() => parseRootCapabilitiesTypeReference('#GlobalActions')).toThrow(
      'Expected a reference of the form "<file>#<TypeName>", got "#GlobalActions".',
    );
  });

  it('throws when the type name portion is empty', () => {
    expect(() =>
      parseRootCapabilitiesTypeReference('app/core/types.ts#'),
    ).toThrow(
      'Expected a reference of the form "<file>#<TypeName>", got "app/core/types.ts#".',
    );
  });
});

describe('discoverFromRootMessengerCapabilitiesTypes', () => {
  it('extracts capabilities from a hand-written union of type references', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
/**
 * Retrieves the state of the FooController.
 */
export type FooControllerGetStateAction = {
  type: 'FooController:getState';
  handler: () => FooState;
};

/**
 * Published when the FooController's state changes.
 */
export type FooControllerStateChangeEvent = {
  type: 'FooController:stateChange';
  payload: [FooState, Patch[]];
};

export type GlobalActions = FooControllerGetStateAction;
export type GlobalEvents = FooControllerStateChangeEvent;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toHaveLength(2);
      expect(result.capabilityPackets[0]).toMatchObject({
        typeName: 'FooControllerGetStateAction',
        typeString: 'FooController:getState',
        kind: 'action',
        jsDoc: 'Retrieves the state of the FooController.',
        handlerOrPayload: '() => FooState',
        sourceFile: path.join('app', 'types.ts'),
      });
      expect(result.capabilityPackets[1]).toMatchObject({
        typeName: 'FooControllerStateChangeEvent',
        typeString: 'FooController:stateChange',
        kind: 'event',
        handlerOrPayload: '[FooState, Patch[]]',
      });
    });
  });

  it('extracts capabilities from a union derived through the type checker', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/messenger.ts',
        `${MESSENGER_PRELUDE}
/**
 * Updates the accounts list.
 */
export type AccountOrderControllerUpdateAction = {
  type: 'AccountOrderController:updateAccountsList';
  handler: (accounts: string[]) => void;
};

export type AccountOrderControllerStateChangeEvent = {
  type: 'AccountOrderController:stateChange';
  payload: [AccountOrderState, Patch[]];
};

const MESSENGER_FACTORIES = {
  accountOrder: {
    getMessenger: () =>
      ({}) as Messenger<
        'AccountOrderController',
        AccountOrderControllerUpdateAction,
        AccountOrderControllerStateChangeEvent
      >,
  },
};

type ChildMessengers = ReturnType<
  (typeof MESSENGER_FACTORIES)[keyof typeof MESSENGER_FACTORIES]['getMessenger']
>;

export type RootMessengerActions = MessengerActions<ChildMessengers>;
export type RootMessengerEvents = MessengerEvents<ChildMessengers>;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/messenger.ts',
          typeName: 'RootMessengerActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/messenger.ts',
          typeName: 'RootMessengerEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        {
          typeName: 'AccountOrderControllerUpdateAction',
          typeString: 'AccountOrderController:updateAccountsList',
          kind: 'action',
          jsDoc: 'Updates the accounts list.',
        },
        {
          typeName: 'AccountOrderControllerStateChangeEvent',
          typeString: 'AccountOrderController:stateChange',
          kind: 'event',
        },
      ]);
      expect(result.skippedCapabilities).toStrictEqual({
        unnamedCapabilities: [],
        unextractableCapabilities: [],
      });
    });
  });

  it('extracts capabilities declared via capability type constructors', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
type ControllerGetStateAction<Namespace extends string, State> = {
  type: \`\${Namespace}:getState\`;
  handler: () => State;
};

type ControllerStateChangeEvent<Namespace extends string, State> = {
  type: \`\${Namespace}:stateChange\`;
  payload: [State, Patch[]];
};

export type BarControllerGetStateAction = ControllerGetStateAction<
  'BarController',
  BarState
>;

export type BarControllerStateChangeEvent = ControllerStateChangeEvent<
  'BarController',
  BarState
>;

export type GlobalActions = BarControllerGetStateAction;
export type GlobalEvents = BarControllerStateChangeEvent;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        {
          typeName: 'BarControllerGetStateAction',
          typeString: 'BarController:getState',
          kind: 'action',
          handlerOrPayload: '() => BarState',
        },
        {
          typeName: 'BarControllerStateChangeEvent',
          typeString: 'BarController:stateChange',
          kind: 'event',
          handlerOrPayload: '[BarState, Patch[]]',
        },
      ]);
    });
  });

  it('extracts capabilities declared as interfaces', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
/**
 * Runs the qux routine.
 */
export interface QuxRunAction {
  type: 'Qux:run';
  handler: (times: number) => void;
}

export type GlobalActions = QuxRunAction;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        {
          typeName: 'QuxRunAction',
          typeString: 'Qux:run',
          kind: 'action',
          jsDoc: 'Runs the qux routine.',
          handlerOrPayload: '(times: number) => void',
        },
      ]);
    });
  });

  // TypeScript collapses `type A = B` before the checker hands us a
  // constituent, so the docs name the type the chain ends at rather than the
  // one the root union referenced. Surprising, but consistent with `scan`.
  it('documents the underlying type when the union references an alias of an alias', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type BazDoActionOriginal = {
  type: 'Baz:do';
  handler: () => void;
};

export type BazDoAction = BazDoActionOriginal;

export type GlobalActions = BazDoAction;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toStrictEqual([
        {
          typeName: 'BazDoActionOriginal',
          typeString: 'Baz:do',
          kind: 'action',
          jsDoc: '',
          params: [],
          returns: '',
          handlerOrPayload: '() => void',
          sourceFile: path.join('app', 'types.ts'),
          line: 2,
          deprecated: false,
        },
      ]);
    });
  });

  it('labels anonymous constituents, truncating long ones', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type GoodAction = { type: 'Good:do'; handler: () => void };

export type GlobalActions =
  | GoodAction
  | string
  | {
      type: 'Anonymous:withAnUnusuallyLongDeclaration';
      handler: (first: string, second: number, third: boolean) => void;
    };

export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        { typeString: 'Good:do' },
      ]);
      expect(result.skippedCapabilities.unnamedCapabilities).toStrictEqual([
        'string',
        '{ type: "Anonymous:withAnUnusuallyLongDeclaration"; handler: (first: string, ...',
      ]);
    });
  });

  it('throws when a root union resolves to `any`', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
import type { Missing } from 'this-package-does-not-exist';

export type GlobalActions = Missing;
export type GlobalEvents = never;
`,
      );

      expect(() =>
        discoverFromRootMessengerCapabilitiesTypes({
          projectPath: directoryPath,
          rootActionsTypeReference: {
            filePath: 'app/types.ts',
            typeName: 'GlobalActions',
          },
          rootEventsTypeReference: {
            filePath: 'app/types.ts',
            typeName: 'GlobalEvents',
          },
        }),
      ).toThrow(
        'app/types.ts#GlobalActions, named by --root-actions, resolved to ' +
          '`Missing` rather than a union of capabilities',
      );
    });
  });

  // TypeScript absorbs `any | T` into `any`, so one unresolved import would
  // otherwise take every sibling capability down with it — silently, since the
  // events union still resolves and generation would report success.
  it('throws rather than dropping the siblings of an unresolved member', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
import type { Missing } from 'this-package-does-not-exist';

export type GoodOne = { type: 'Good:one'; handler: () => void };
export type GoodTwo = { type: 'Good:two'; handler: () => void };
export type SomeEvent = { type: 'Good:changed'; payload: [string] };

export type GlobalActions = GoodOne | GoodTwo | Missing;
export type GlobalEvents = SomeEvent;
`,
      );

      expect(() =>
        discoverFromRootMessengerCapabilitiesTypes({
          projectPath: directoryPath,
          rootActionsTypeReference: {
            filePath: 'app/types.ts',
            typeName: 'GlobalActions',
          },
          rootEventsTypeReference: {
            filePath: 'app/types.ts',
            typeName: 'GlobalEvents',
          },
        }),
      ).toThrow(
        // The whole union has become plain `any` — `GoodOne` and `GoodTwo` are
        // no longer visible to the checker at all.
        'app/types.ts#GlobalActions, named by --root-actions, resolved to ' +
          '`any` rather than a union of capabilities',
      );
    });
  });

  // The lone-instantiation fallback must not fire for a union: an anonymous
  // member is genuinely anonymous, and blaming the wrapper type would file it
  // under the wrong bucket with a misleading name.
  it('reports an inline member as unnamed when the root aliases a union', async () => {
    expect.assertions(3);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type NamedAction = { type: 'Named:do'; handler: () => void };

type AllActions = NamedAction | { type: 'Anonymous:do'; handler: () => void };

export type GlobalActions = AllActions;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        { typeString: 'Named:do' },
      ]);
      expect(result.skippedCapabilities.unnamedCapabilities).toStrictEqual([
        '{ type: "Anonymous:do"; handler: () => void; }',
      ]);
      expect(
        result.skippedCapabilities.unextractableCapabilities,
      ).toStrictEqual([]);
    });
  });

  it('reports a root that is a single inline capability as unnamed', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type GlobalActions = { type: 'Anonymous:do'; handler: () => void };
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toStrictEqual([]);
      expect(result.skippedCapabilities.unnamedCapabilities).toStrictEqual([
        '{ type: "Anonymous:do"; handler: () => void; }',
      ]);
    });
  });

  it('documents a lone generic instantiation of a type alias', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type GenericAction<Value> = {
  type: 'Gen:do';
  handler: (value: Value) => void;
};

export type GlobalActions = GenericAction<string>;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        { typeName: 'GenericAction', typeString: 'Gen:do', kind: 'action' },
      ]);
      expect(result.skippedCapabilities.unnamedCapabilities).toStrictEqual([]);
    });
  });

  it('documents a lone generic instantiation, whose alias symbol is the root union itself', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export interface GenericAction<Value> {
  type: 'Gen:do';
  handler: (value: Value) => void;
}

export type GlobalActions = GenericAction<string>;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        {
          typeName: 'GenericAction',
          typeString: 'Gen:do',
          kind: 'action',
          // The declaration's own text, so the type parameter is not
          // substituted. Matches what `scan` produces for the same type.
          handlerOrPayload: '(value: Value) => void',
        },
      ]);
      expect(
        result.skippedCapabilities.unextractableCapabilities,
      ).toStrictEqual([]);
    });
  });

  it('resolves capability types imported from another file', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/qux-controller.ts',
        `
/**
 * Does the qux thing.
 */
export type QuxControllerDoAction = {
  type: 'QuxController:do';
  handler: () => void;
};
`,
      );
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
import type { QuxControllerDoAction } from './qux-controller';

export type GlobalActions = QuxControllerDoAction;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        {
          typeString: 'QuxController:do',
          jsDoc: 'Does the qux thing.',
          sourceFile: path.join('app', 'qux-controller.ts'),
        },
      ]);
      expect(result.skippedCapabilities).toStrictEqual({
        unnamedCapabilities: [],
        unextractableCapabilities: [],
      });
    });
  });

  it('counts constituents that have no named declaration as unnamed', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type NamedAction = {
  type: 'Named:do';
  handler: () => void;
};

export type GlobalActions =
  | NamedAction
  | { type: 'Anonymous:do'; handler: () => void };

export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        { typeString: 'Named:do' },
      ]);
      expect(result.skippedCapabilities.unnamedCapabilities).toStrictEqual([
        '{ type: "Anonymous:do"; handler: () => void; }',
      ]);
    });
  });

  it('counts capability types that cannot be extracted as unextractable', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type GoodAction = {
  type: 'Good:do';
  handler: () => void;
};

export type UnnamespacedAction = {
  type: 'nocolon';
  handler: () => void;
};

export type GlobalActions = GoodAction | UnnamespacedAction;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        { typeString: 'Good:do' },
      ]);
      expect(
        result.skippedCapabilities.unextractableCapabilities,
      ).toStrictEqual([
        `UnnamespacedAction (${path.join('app', 'types.ts')}:7)`,
      ]);
    });
  });

  it('reads actions and events from different files', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/actions.ts',
        `
export type SplitDoAction = { type: 'Split:do'; handler: () => void };
export type GlobalActions = SplitDoAction;
`,
      );
      await writeFixture(
        directoryPath,
        'app/events.ts',
        `
export type SplitDoneEvent = { type: 'Split:done'; payload: [string] };
export type GlobalEvents = SplitDoneEvent;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/actions.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/events.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toMatchObject([
        { typeString: 'Split:do', kind: 'action' },
        { typeString: 'Split:done', kind: 'event' },
      ]);
    });
  });

  it('throws when the entry file does not exist', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      expect(() =>
        discoverFromRootMessengerCapabilitiesTypes({
          projectPath: directoryPath,
          rootActionsTypeReference: {
            filePath: 'app/missing.ts',
            typeName: 'GlobalActions',
          },
          rootEventsTypeReference: {
            filePath: 'app/missing.ts',
            typeName: 'GlobalEvents',
          },
        }),
      ).toThrow(
        `Could not read ${path.join(directoryPath, 'app', 'missing.ts')}, which was named by --root-actions.`,
      );
    });
  });

  it('throws when the named type alias is not declared in the entry file', async () => {
    expect.assertions(1);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `export type GlobalActions = never;\n`,
      );

      expect(() =>
        discoverFromRootMessengerCapabilitiesTypes({
          projectPath: directoryPath,
          rootActionsTypeReference: {
            filePath: 'app/types.ts',
            typeName: 'GlobalActions',
          },
          rootEventsTypeReference: {
            filePath: 'app/types.ts',
            typeName: 'NotDeclared',
          },
        }),
      ).toThrow(
        `No type alias named "NotDeclared" in ${path.join('app', 'types.ts')}, which was named by --root-events.`,
      );
    });
  });

  it('returns no packets when both root unions resolve to `never`', async () => {
    expect.assertions(2);

    await withinSandbox(async ({ directoryPath }) => {
      await writeFixture(
        directoryPath,
        'app/types.ts',
        `
export type GlobalActions = never;
export type GlobalEvents = never;
`,
      );

      const result = discoverFromRootMessengerCapabilitiesTypes({
        projectPath: directoryPath,
        rootActionsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalActions',
        },
        rootEventsTypeReference: {
          filePath: 'app/types.ts',
          typeName: 'GlobalEvents',
        },
      });

      expect(result.capabilityPackets).toStrictEqual([]);
      expect(result.skippedCapabilities).toStrictEqual({
        unnamedCapabilities: [],
        unextractableCapabilities: [],
      });
    });
  });
});
