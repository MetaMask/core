export {
  PreferencesController,
  getDefaultPreferencesState
} from './PreferencesController';

export type {
  Identity,
  EtherscanSupportedChains,
  EtherscanSupportedHexChainId,
  PreferencesState,
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
  PreferencesControllerActions,
  PreferencesControllerEvents,
  AllowedEvents,
  PreferencesControllerMessenger
} from './PreferencesController';

export { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';
