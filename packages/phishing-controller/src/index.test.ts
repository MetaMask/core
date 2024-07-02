import * as allExports from '.';

describe('@metamask/phishing-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "PHISHING_CONFIG_BASE_URL",
        "METAMASK_STALELIST_FILE",
        "METAMASK_HOTLIST_DIFF_FILE",
        "HOTLIST_REFRESH_INTERVAL",
        "STALELIST_REFRESH_INTERVAL",
        "METAMASK_STALELIST_URL",
        "METAMASK_HOTLIST_DIFF_URL",
        "phishingListKeyNameMap",
        "PhishingController",
      ]
    `);
  });

  it('has expected TypeScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "PHISHING_CONFIG_BASE_URL",
        "METAMASK_STALELIST_FILE",
        "METAMASK_HOTLIST_DIFF_FILE",
        "HOTLIST_REFRESH_INTERVAL",
        "STALELIST_REFRESH_INTERVAL",
        "METAMASK_STALELIST_URL",
        "METAMASK_HOTLIST_DIFF_URL",
        "phishingListKeyNameMap",
        "PhishingController",
      ]
    `);
  });
});
