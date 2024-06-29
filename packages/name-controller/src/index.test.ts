export { FALLBACK_VARIATION, PROPOSED_NAME_EXPIRE_DURATION, NameOrigin, NameController } from './NameController';
export type { ProposedNamesEntry, NameEntry, SourceEntry, NameControllerState, GetNameState, NameStateChange, NameControllerActions, NameControllerEvents, NameControllerMessenger, NameControllerOptions, UpdateProposedNamesRequest, UpdateProposedNamesResult, SetNameRequest } from './NameController';

export { NameType, NameProviderMetadata, NameProviderRequest, NameProviderSourceResult, NameProviderResult, NameProvider } from './types';

export { ENSNameProvider } from './providers/ens';
export { EtherscanNameProvider } from './providers/etherscan';
export { TokenNameProvider } from './providers/token';
export { LensNameProvider } from './providers/lens';

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
