// <reference types="jest" />

import * as allExports from '.';

describe('@metamask/network-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "knownKeysOf",
        "NetworkController",
        "defaultState",
        "NetworkStatus",
        "INFURA_BLOCKED_KEY",
        "NetworkClientType",
      ]
    `);
  });
});
