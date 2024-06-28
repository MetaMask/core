import * as allExports from '.';

describe('@metamask/notification-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "NotificationController",
      ]
    `);
  });
});
