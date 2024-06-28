import * as allExports from '.';

describe('@metamask/announcement-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "AnnouncementController",
      ]
    `);
  });
});
