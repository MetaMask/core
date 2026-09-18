import * as allExports from './index.js';

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
