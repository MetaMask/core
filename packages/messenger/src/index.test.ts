import * as allExports from './index.js';

describe('@metamask/messenger', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "MOCK_ANY_NAMESPACE",
        "Messenger",
      ]
    `);
  });
});
