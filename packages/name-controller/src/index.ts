export { NameController } from './NameController';

export type {
  NameControllerState,
  GetNameState,
  NameStateChange,
  NameControllerActions,
  NameControllerEvents,
  NameControllerOptions,
  UpdateProposedNamesRequest,
  UpdateProposedNamesResult,
  SetNameRequest,
} from './NameController';

export { ENSNameProvider } from './providers/ens';
export { EtherscanNameProvider } from './providers/etherscan';
export { TokenNameProvider } from './providers/token';
export { LensNameProvider } from './providers/lens';

export const FALLBACK_VARIATION = '*';
export const PROPOSED_NAME_EXPIRE_DURATION = 60 * 60 * 24; // 24 hours
export enum NameOrigin {
  // Originated from an account identity.
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ACCOUNT_IDENTITY = 'account-identity',
  // Originated from an address book entry.
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ADDRESS_BOOK = 'address-book',
  // Originated from the API (NameController.setName). This is the default.
  API = 'api',
  // Originated from the user taking action in the UI.
  UI = 'ui',
}
