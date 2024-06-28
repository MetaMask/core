/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-namespace */

import * as allExports from '.';

describe('@metamask/name-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "FALLBACK_VARIATION",
        "PROPOSED_NAME_EXPIRE_DURATION",
        "NameOrigin",
        "ProposedNamesEntry",
        "NameEntry",
        "NameControllerState",
        "GetNameState",
        "NameStateChange",
        "NameControllerActions",
        "NameControllerEvents",
        "NameControllerOptions",
        "UpdateProposedNamesRequest",
        "UpdateProposedNamesResult",
        "NameController",
        "ENSNameProvider",
        "EtherscanNameProvider",
        "TokenNameProvider",
        "LensNameProvider",
      ]
    `);
  });
});
