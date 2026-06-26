import * as allExports from '.';

describe('@metamask/eip-5792-middleware', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "processSendCalls",
        "getCallsStatus",
        "getCapabilities",
        "walletSendCalls",
        "walletGetCallsStatus",
        "walletGetCapabilities",
      ]
    `);
  });
});
