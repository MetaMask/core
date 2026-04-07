import type { MessengerItemDoc, NamespaceGroup } from './types';
import {
  generateIndexPage,
  generateItemMarkdown,
  generateNamespacePage,
  generateSidebars,
} from './markdown';

const makeItem = (
  overrides: Partial<MessengerItemDoc> = {},
): MessengerItemDoc => ({
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
    const result = generateItemMarkdown(item, 'FooController', new Map(), null);

    expect(result).toContain('**Payload**:');
    expect(result).toContain('[FooState, Patch[]]');
  });

  it('marks deprecated items', () => {
    const item = makeItem({ deprecated: true });
    const result = generateItemMarkdown(item, 'FooController', new Map(), null);

    expect(result).toContain('> **Deprecated**');
  });

  it('includes JSDoc text', () => {
    const item = makeItem({ jsDoc: 'Gets the current state.' });
    const result = generateItemMarkdown(item, 'FooController', new Map(), null);

    expect(result).toContain('Gets the current state.');
  });

  it('shows npm link for node_modules sources', () => {
    const item = makeItem({
      sourceFile: 'node_modules/@metamask/base-controller/dist/index.d.cts',
    });
    const result = generateItemMarkdown(item, 'FooController', new Map(), null);

    expect(result).toContain('npmjs.com/package/@metamask/base-controller');
  });

  it('linkifies backtick references to known actions', () => {
    const known = new Map([['getState', '#foocontrollergetstate']]);
    const item = makeItem({ jsDoc: 'See `getState` for details.' });
    const result = generateItemMarkdown(item, 'FooController', known, null);

    expect(result).toContain('[`getState`](#foocontrollergetstate)');
  });

  it('shows plain source path when no repo URL', () => {
    const item = makeItem();
    const result = generateItemMarkdown(item, 'FooController', new Map(), null);

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
});

describe('generateIndexPage', () => {
  it('generates index with namespace list', () => {
    const groups = [makeGroup()];
    const result = generateIndexPage(groups);

    expect(result).toContain('Messenger API Reference');
    expect(result).toContain('FooController');
    expect(result).toContain('**1** actions');
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
