import * as allExports from '.';

describe('@metamask/name-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "FALLBACK_VARIATION",
      "PROPOSED_NAME_EXPIRE_DURATION",
      "NameOrigin",
      "NameController",
      "NameType",
      "NameProviderMetadata",
      "NameProviderRequest",
      "NameProviderSourceResult",
      "NameProviderResult",
      "NameProvider",
      "ENSNameProvider",
      "EtherscanNameProvider",
      "TokenNameProvider",
      "LensNameProvider",
    ]`);
  });
});
