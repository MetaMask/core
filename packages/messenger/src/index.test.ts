import * as allExports from '.';

describe('@metamask/messenger', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "DISABLE_NAMESPACE",
        "Messenger",
      ]
    `);
  });
});
