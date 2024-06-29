import * as allExports from '.';

describe('@metamask/signature-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "GetSignatureState",
      "SignatureStateChange",
      "SignatureControllerActions",
      "SignatureControllerEvents",
      "SignatureControllerMessenger",
      "SignatureControllerOptions",
      "SignatureController"
    ]`);
  });
});
