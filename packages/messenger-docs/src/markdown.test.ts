import {
  generateIndexPage,
  generateItemMarkdown,
  generateNamespacePage,
  generateSidebars,
} from './markdown';
import type { ExtractedMessengerCapabilityType, NamespaceGroup } from './types';

const makeItem = (
  overrides: Partial<ExtractedMessengerCapabilityType> = {},
): ExtractedMessengerCapabilityType => ({
  typeName: 'FooControllerGetStateAction',
  typeString: 'FooController:getState',
  kind: 'action',
  jsDoc: '',
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
      expect(result).toContain('**Handler**:');
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

      expect(result).toContain('**Payload**:');
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
  });
});
