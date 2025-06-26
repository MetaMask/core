import * as allExports from '.';

describe('@metamask/profile-sync-controller/auth', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "Controller",
        "Mocks",
        "default",
        "defaultState",
      ]
    `);

    expect(Object.keys(allExports.Mocks)).toMatchInlineSnapshot(`
      Array [
        "MOCK_NONCE",
        "MOCK_NONCE_RESPONSE",
        "getMockAuthNonceResponse",
        "MOCK_JWT",
        "MOCK_LOGIN_RESPONSE",
        "getMockAuthLoginResponse",
        "MOCK_ACCESS_TOKEN",
        "MOCK_OATH_TOKEN_RESPONSE",
        "getMockAuthAccessTokenResponse",
      ]
    `);
  });
});
