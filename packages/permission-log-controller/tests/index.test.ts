import * as allExports from '../src';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "PermissionLogController",
      ]
    `);
  });
});
