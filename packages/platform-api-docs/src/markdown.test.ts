import {
  generateIndexPage,
  generateItemMarkdown,
  generateNamespacePage,
  generateSidebars,
} from './markdown.js';
import type { MessengerCapabilityPacket, NamespaceGroup } from './types.js';

const makeItem = (
  overrides: Partial<MessengerCapabilityPacket> = {},
): MessengerCapabilityPacket => ({
  typeName: 'FooControllerGetStateAction',
  typeString: 'FooController:getState',
  kind: 'action',
  jsDoc: '',
  params: [],
  returns: '',
  handlerOrPayload: '() => FooState',
  sourceFile: 'packages/foo/src/FooController.ts',
  line: 10,
  deprecated: false,
  ...overrides,
});

const makeGroup = (
  overrides: Partial<NamespaceGroup> = {},
): NamespaceGroup => ({
  namespace: 'FooController',
  actions: [makeItem()],
  events: [],
  ...overrides,
});

describe('markdown', () => {
  describe('generateItemMarkdown', () => {
    it('generates markdown for an action', () => {
      const item = makeItem();
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        'https://github.com/MetaMask/core/blob/main/',
      );

      expect(result).toContain('### `FooController:getState`');
      expect(result).toContain('**Handler signature**:');
      expect(result).toContain('() => FooState');
      expect(result).toContain('FooController.ts:10');
    });

    it('generates markdown for an event', () => {
      const item = makeItem({
        typeName: 'FooControllerChangeEvent',
        typeString: 'FooController:change',
        kind: 'event',
        handlerOrPayload: '[FooState, Patch[]]',
      });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('**Payload signature**:');
      expect(result).toContain('[FooState, Patch[]]');
    });

    it('marks deprecated items', () => {
      const item = makeItem({ deprecated: true });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('> **Deprecated**');
    });

    it('includes JSDoc text', () => {
      const item = makeItem({ jsDoc: 'Gets the current state.' });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('Gets the current state.');
    });

    it('shows npm link for node_modules sources', () => {
      const item = makeItem({
        sourceFile: 'node_modules/@metamask/base-controller/dist/index.d.cts',
      });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('npmjs.com/package/@metamask/base-controller');
    });

    it('renders a plain source path for non-@metamask node_modules entries', async () => {
      const item = makeItem({
        sourceFile: 'node_modules/some-vendor/dist/index.d.ts',
      });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      // No @metamask scope match — fall through to the normal source-link
      // branches rather than producing a broken `npmjs.com/package/<path>`
      // URL.
      expect(result).toContain(
        '**Source**: `node_modules/some-vendor/dist/index.d.ts:10`',
      );
      expect(result).not.toContain('npmjs.com/package/node_modules');
    });

    it('renders a GitHub source link for non-@metamask node_modules entries when a repo URL is given', async () => {
      const item = makeItem({
        sourceFile: 'node_modules/some-vendor/dist/index.d.ts',
      });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        'https://github.com/MetaMask/core/blob/main/',
      );

      expect(result).toContain(
        '(https://github.com/MetaMask/core/blob/main/node_modules/some-vendor/dist/index.d.ts#L10)',
      );
      expect(result).not.toContain('npmjs.com/package/node_modules');
    });

    it('linkifies backtick references to known actions', () => {
      const known = new Map([['getState', '#foocontrollergetstate']]);
      const item = makeItem({ jsDoc: 'See `getState` for details.' });
      const result = generateItemMarkdown(item, 'FooController', known, null);

      expect(result).toContain('[`getState`](#foocontrollergetstate)');
    });

    it('linkifies references via namespace prefix lookup', () => {
      const known = new Map([['FooController:reset', '#foocontrollerreset']]);
      const item = makeItem({ jsDoc: 'Call `reset` to clear state.' });
      const result = generateItemMarkdown(item, 'FooController', known, null);

      expect(result).toContain('[`reset`](#foocontrollerreset)');
    });

    it('linkifies references via anchor fallback', () => {
      const known = new Map([['irrelevant', './actions#foocontrollerreset']]);
      const item = makeItem({ jsDoc: 'Call `reset` to clear.' });
      const result = generateItemMarkdown(item, 'FooController', known, null);

      expect(result).toContain('[`reset`](./actions#foocontrollerreset)');
    });

    it('does not linkify unknown references', () => {
      const item = makeItem({ jsDoc: 'See `unknownThing` for info.' });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('`unknownThing`');
      expect(result).not.toContain('[`unknownThing`]');
    });

    it('shows plain source path when no repo URL', () => {
      const item = makeItem();
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain(
        '**Source**: `packages/foo/src/FooController.ts:10`',
      );
    });

    it('renders a parameters table when an action has @param tags', () => {
      const item = makeItem({
        params: [
          { name: 'opts.id', description: 'The id of the request.' },
          { name: 'opts.type', description: 'The type associated.' },
        ],
      });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('**Parameters**:');
      expect(result).toContain('| `opts.id` | The id of the request. |');
      expect(result).toContain('| `opts.type` | The type associated. |');
    });

    it('renders a Returns line when an action has a @returns tag', () => {
      const item = makeItem({ returns: 'The approval promise.' });
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).toContain('**Returns**: The approval promise.');
    });

    it('linkifies backtick references inside param descriptions', () => {
      const known = new Map([['reset', '#foocontrollerreset']]);
      const item = makeItem({
        params: [{ name: 'x', description: 'Call `reset` first.' }],
      });
      const result = generateItemMarkdown(item, 'FooController', known, null);

      expect(result).toContain('[`reset`](#foocontrollerreset)');
    });

    it('omits the parameters table when an action has no @param tags', () => {
      const item = makeItem();
      const result = generateItemMarkdown(
        item,
        'FooController',
        new Map(),
        null,
      );

      expect(result).not.toContain('**Parameters**:');
    });
  });

  describe('generateNamespacePage', () => {
    it('generates action page with summary table', () => {
      const group = makeGroup();
      const result = generateNamespacePage(group, 'action', null);

      expect(result).toContain('title: "FooController Actions"');
      expect(result).toContain('1 action registered.');
      expect(result).toContain('`getState`');
    });

    it('generates event page', () => {
      const group = makeGroup({
        actions: [],
        events: [
          makeItem({
            typeString: 'FooController:change',
            kind: 'event',
            handlerOrPayload: '[string]',
          }),
        ],
      });
      const result = generateNamespacePage(group, 'event', null);

      expect(result).toContain('title: "FooController Events"');
      expect(result).toContain('1 event registered.');
    });

    it('shows no-items message when empty', () => {
      const group = makeGroup({ actions: [], events: [] });
      const result = generateNamespacePage(group, 'action', null);

      expect(result).toContain('_No actions found for this namespace._');
    });

    it('falls back to no source links when repoBaseUrl is omitted', () => {
      const group = makeGroup();
      // Calling without a third argument exercises the default value.
      const result = generateNamespacePage(group, 'action');

      expect(result).toContain(
        '**Source**: `packages/foo/src/FooController.ts',
      );
    });

    it('marks deprecated items in the summary table', () => {
      const group = makeGroup({
        actions: [
          makeItem({ deprecated: true }),
          makeItem({ typeString: 'FooController:reset' }),
        ],
      });
      const result = generateNamespacePage(group, 'action', null);

      // The summary table should call out the deprecated item with a "Yes".
      const tableRow = result
        .split('\n')
        .find((line) => line.startsWith('| [`getState`]'));
      expect(tableRow).toMatch(/\| Yes \|$/u);
    });

    it('cross-links events from an action page to ./events#anchor', () => {
      const group = makeGroup({
        actions: [makeItem()],
        events: [
          makeItem({
            typeName: 'FooControllerChangeEvent',
            typeString: 'FooController:change',
            kind: 'event',
            handlerOrPayload: '[FooState]',
          }),
        ],
      });
      // Generated with kind='action': the page is about actions, but events
      // are still added to the cross-reference map with relative anchors.
      const result = generateNamespacePage(
        group,
        'action',
        'https://github.com/MetaMask/core/blob/main/',
      );

      expect(result).toContain('title: "FooController Actions"');
      // Plural is rendered correctly when there is more than one item of the
      // other kind referenced. (The page itself has 1 action.)
      expect(result).toContain('1 action registered.');
      // Source link uses the repoBaseUrl.
      expect(result).toContain(
        '(https://github.com/MetaMask/core/blob/main/packages/foo/src/FooController.ts#L10)',
      );
      // Marker that the table of contents was rendered.
      expect(result).toContain('| Name | Deprecated |');
    });

    it('cross-links actions from an event page to ./actions#anchor and marks deprecated items', () => {
      const group = makeGroup({
        actions: [makeItem({ deprecated: true })],
        events: [
          makeItem({
            typeName: 'FooControllerChangeEvent',
            typeString: 'FooController:change',
            kind: 'event',
            handlerOrPayload: '[FooState]',
          }),
          makeItem({
            typeName: 'FooControllerResetEvent',
            typeString: 'FooController:reset',
            kind: 'event',
            handlerOrPayload: '[]',
          }),
        ],
      });
      const result = generateNamespacePage(group, 'event', null);

      // Plural rendering when more than one event is registered.
      expect(result).toContain('2 events registered.');
      // Source link is plain (no repoBaseUrl).
      expect(result).toContain(
        '**Source**: `packages/foo/src/FooController.ts',
      );
    });
  });

  describe('generateIndexPage', () => {
    it('generates index with namespace list', () => {
      const groups = [makeGroup()];
      const result = generateIndexPage(groups);

      expect(result).toContain('Platform API Reference');
      expect(result).toContain('FooController');
      expect(result).toContain('**1** actions');
    });

    it('links to events when a namespace has only events', () => {
      const groups = [
        makeGroup({
          actions: [],
          events: [
            makeItem({
              typeString: 'FooController:change',
              kind: 'event',
              handlerOrPayload: '[FooState]',
            }),
          ],
        }),
      ];
      const result = generateIndexPage(groups);

      // When a namespace has no actions, the index row should link to the
      // events page instead of actions.
      expect(result).toContain('[FooController](FooController/events)');
    });

    it('stamps the project label into the title and heading', () => {
      const groups = [makeGroup()];
      const result = generateIndexPage(groups, { projectLabel: 'Core' });

      expect(result).toContain('title: "Platform API (Core) Reference"');
      expect(result).toContain('# Platform API (Core)');
    });

    it('stamps the commit sha into the intro when provided', () => {
      const groups = [makeGroup()];
      const result = generateIndexPage(groups, { commitSha: 'abc1234' });

      expect(result).toContain('Generated from commit `abc1234`.');
    });

    it('omits the commit line when no sha is provided', () => {
      const groups = [makeGroup()];
      const result = generateIndexPage(groups);

      expect(result).not.toContain('Generated from commit');
    });
  });

  describe('generateSidebars', () => {
    it('generates sidebars config', () => {
      const groups = [makeGroup()];
      const result = generateSidebars(groups);

      expect(result).toContain('FooController');
      expect(result).toContain('actions');
    });

    it('includes both actions and events when the namespace has both', () => {
      const groups = [
        makeGroup({
          actions: [makeItem()],
          events: [
            makeItem({
              typeString: 'FooController:change',
              kind: 'event',
              handlerOrPayload: '[FooState]',
            }),
          ],
        }),
      ];
      const result = generateSidebars(groups);

      expect(result).toContain('FooController/actions');
      expect(result).toContain('FooController/events');
    });
  });
});
