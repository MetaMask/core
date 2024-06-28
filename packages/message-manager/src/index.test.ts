import * as allExports from '.';

describe('@metamask/message-manager', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "AbstractMessageManager",
        "PersonalMessageManager",
        "TypedMessageManager",
        "EncryptionPublicKeyManager",
        "DecryptMessageManager",
        "normalizeMessageData",
        "validateSignMessageData",
        "validateTypedSignMessageDataV1",
        "validateTypedSignMessageDataV3V4",
        "validateEncryptionPublicKeyMessageData",
        "validateDecryptedMessageData",
      ]
    `);
  });
});
