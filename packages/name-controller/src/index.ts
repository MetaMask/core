export {
  FALLBACK_VARIATION,
  PROPOSED_NAME_EXPIRE_DURATION,
  NameOrigin,
  NameController,
} from './NameController';

export type {
  ProposedNamesEntry,
  NameEntry,
  SourceEntry,
  NameControllerState,
  GetNameState,
  NameStateChange,
  NameControllerActions,
  NameControllerEvents,
  NameControllerMessenger,
  NameControllerOptions,
  UpdateProposedNamesRequest,
  UpdateProposedNamesResult,
  SetNameRequest,
} from './NameController';

export type {
  NameType,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderSourceResult,
  NameProviderResult,
  NameProvider,
} from './types';

export { ENSNameProvider } from './providers/ens';
export { EtherscanNameProvider } from './providers/etherscan';
export { TokenNameProvider } from './providers/token';
export { LensNameProvider } from './providers/lens';
