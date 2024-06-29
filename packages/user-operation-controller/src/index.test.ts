import * as allExports from '.';

describe('@metamask/user-operation-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "UserOperationController",
      ]
    `);
  });
});
