import * as allExports from '.';
describe('@metamask/announcement-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "AnnouncementMap",
      "StateAnnouncementMap",
      "AnnouncementControllerState",
      "AnnouncementControllerActions",
      "AnnouncementControllerEvents",
      "AnnouncementControllerGetStateAction",
      "AnnouncementControllerStateChangeEvent",
      "AnnouncementControllerMessenger",
      "AnnouncementController"
    ]`);
  });
});
