import * as allExports from '.';

describe('@metamask/build-utils', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "removeFencedCode",
        "lintTransformedFile",
      ]
    `);
  });
});
