/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PreferencesController } from './PreferencesController';

/**
 * Enable or disable a specific feature flag.
 *
 * @param feature - Feature to toggle.
 * @param activated - Value to assign.
 */
export type PreferencesControllerSetFeatureFlagAction = {
  type: `PreferencesController:setFeatureFlag`;
  handler: PreferencesController['setFeatureFlag'];
};

/**
 * Sets new IPFS gateway.
 *
 * @param ipfsGateway - IPFS gateway string.
 */
export type PreferencesControllerSetIpfsGatewayAction = {
  type: `PreferencesController:setIpfsGateway`;
  handler: PreferencesController['setIpfsGateway'];
};

/**
 * Toggle the token detection setting.
 *
 * @param useTokenDetection - Boolean indicating user preference on token detection.
 */
export type PreferencesControllerSetUseTokenDetectionAction = {
  type: `PreferencesController:setUseTokenDetection`;
  handler: PreferencesController['setUseTokenDetection'];
};

/**
 * Toggle the NFT detection setting.
 *
 * @param useNftDetection - Boolean indicating user preference on NFT detection.
 */
export type PreferencesControllerSetUseNftDetectionAction = {
  type: `PreferencesController:setUseNftDetection`;
  handler: PreferencesController['setUseNftDetection'];
};

/**
 * Toggle the display nft media enabled setting.
 *
 * @param displayNftMedia - Boolean indicating user preference on using OpenSea's API.
 */
export type PreferencesControllerSetDisplayNftMediaAction = {
  type: `PreferencesController:setDisplayNftMedia`;
  handler: PreferencesController['setDisplayNftMedia'];
};

/**
 * Toggle the security alert enabled setting.
 *
 * @param securityAlertsEnabled - Boolean indicating user preference on using security alerts.
 */
export type PreferencesControllerSetSecurityAlertsEnabledAction = {
  type: `PreferencesController:setSecurityAlertsEnabled`;
  handler: PreferencesController['setSecurityAlertsEnabled'];
};

/**
 * A setter for the user preferences to enable/disable fetch of multiple accounts balance.
 *
 * @param isMultiAccountBalancesEnabled - true to enable multiple accounts balance fetch, false to fetch only selectedAddress.
 */
export type PreferencesControllerSetIsMultiAccountBalancesEnabledAction = {
  type: `PreferencesController:setIsMultiAccountBalancesEnabled`;
  handler: PreferencesController['setIsMultiAccountBalancesEnabled'];
};

/**
 * A setter for the user have the test networks visible/hidden.
 *
 * @param showTestNetworks - true to show test networks, false to hidden.
 */
export type PreferencesControllerSetShowTestNetworksAction = {
  type: `PreferencesController:setShowTestNetworks`;
  handler: PreferencesController['setShowTestNetworks'];
};

/**
 * A setter for the user allow to be fetched IPFS content
 *
 * @param isIpfsGatewayEnabled - true to enable ipfs source
 */
export type PreferencesControllerSetIsIpfsGatewayEnabledAction = {
  type: `PreferencesController:setIsIpfsGatewayEnabled`;
  handler: PreferencesController['setIsIpfsGatewayEnabled'];
};

/**
 * A setter for the user allow to be fetched IPFS content
 *
 * @param chainId - On hexadecimal format to enable the incoming transaction network
 * @param isIncomingTransactionNetworkEnable - true to enable incoming transactions
 */
export type PreferencesControllerSetEnableNetworkIncomingTransactionsAction = {
  type: `PreferencesController:setEnableNetworkIncomingTransactions`;
  handler: PreferencesController['setEnableNetworkIncomingTransactions'];
};

/**
 * Toggle multi rpc migration modal.
 *
 * @param showMultiRpcModal - Boolean indicating if the multi rpc modal will be displayed or not.
 */
export type PreferencesControllerSetShowMultiRpcModalAction = {
  type: `PreferencesController:setShowMultiRpcModal`;
  handler: PreferencesController['setShowMultiRpcModal'];
};

/**
 * A setter for the user to opt into smart transactions
 *
 * @param smartTransactionsOptInStatus - true to opt into smart transactions
 */
export type PreferencesControllerSetSmartTransactionsOptInStatusAction = {
  type: `PreferencesController:setSmartTransactionsOptInStatus`;
  handler: PreferencesController['setSmartTransactionsOptInStatus'];
};

/**
 * A setter for the user preferences to enable/disable transaction simulations.
 *
 * @param useTransactionSimulations - true to enable transaction simulations, false to disable it.
 */
export type PreferencesControllerSetUseTransactionSimulationsAction = {
  type: `PreferencesController:setUseTransactionSimulations`;
  handler: PreferencesController['setUseTransactionSimulations'];
};

/**
 * A setter to update the user's preferred token sorting order.
 *
 * @param tokenSortConfig - a configuration representing the sort order of tokens.
 */
export type PreferencesControllerSetTokenSortConfigAction = {
  type: `PreferencesController:setTokenSortConfig`;
  handler: PreferencesController['setTokenSortConfig'];
};

/**
 * A setter for the user preferences to enable/disable safe chains list validation.
 *
 * @param useSafeChainsListValidation - true to enable safe chains list validation, false to disable it.
 */
export type PreferencesControllerSetUseSafeChainsListValidationAction = {
  type: `PreferencesController:setUseSafeChainsListValidation`;
  handler: PreferencesController['setUseSafeChainsListValidation'];
};

/**
 * A setter for the user preferences to enable/disable privacy mode.
 *
 * @param privacyMode - true to enable privacy mode, false to disable it.
 */
export type PreferencesControllerSetPrivacyModeAction = {
  type: `PreferencesController:setPrivacyMode`;
  handler: PreferencesController['setPrivacyMode'];
};

/**
 * A setter for the user preferences dismiss smart account upgrade prompt.
 *
 * @param dismissSmartAccountSuggestionEnabled - true to dismiss smart account upgrade prompt, false to enable it.
 */
export type PreferencesControllerSetDismissSmartAccountSuggestionEnabledAction =
  {
    type: `PreferencesController:setDismissSmartAccountSuggestionEnabled`;
    handler: PreferencesController['setDismissSmartAccountSuggestionEnabled'];
  };

/**
 * A setter for the user preferences smart account OptIn.
 *
 * @param smartAccountOptIn - true if user opts in for smart account update, false otherwise.
 */
export type PreferencesControllerSetSmartAccountOptInAction = {
  type: `PreferencesController:setSmartAccountOptIn`;
  handler: PreferencesController['setSmartAccountOptIn'];
};

/**
 * Set the token network filter configuration setting.
 *
 * @param tokenNetworkFilter - Object describing token network filter configuration.
 */
export type PreferencesControllerSetTokenNetworkFilterAction = {
  type: `PreferencesController:setTokenNetworkFilter`;
  handler: PreferencesController['setTokenNetworkFilter'];
};

/**
 * Union of all PreferencesController action types.
 */
export type PreferencesControllerMethodActions =
  | PreferencesControllerSetFeatureFlagAction
  | PreferencesControllerSetIpfsGatewayAction
  | PreferencesControllerSetUseTokenDetectionAction
  | PreferencesControllerSetUseNftDetectionAction
  | PreferencesControllerSetDisplayNftMediaAction
  | PreferencesControllerSetSecurityAlertsEnabledAction
  | PreferencesControllerSetIsMultiAccountBalancesEnabledAction
  | PreferencesControllerSetShowTestNetworksAction
  | PreferencesControllerSetIsIpfsGatewayEnabledAction
  | PreferencesControllerSetEnableNetworkIncomingTransactionsAction
  | PreferencesControllerSetShowMultiRpcModalAction
  | PreferencesControllerSetSmartTransactionsOptInStatusAction
  | PreferencesControllerSetUseTransactionSimulationsAction
  | PreferencesControllerSetTokenSortConfigAction
  | PreferencesControllerSetUseSafeChainsListValidationAction
  | PreferencesControllerSetPrivacyModeAction
  | PreferencesControllerSetDismissSmartAccountSuggestionEnabledAction
  | PreferencesControllerSetSmartAccountOptInAction
  | PreferencesControllerSetTokenNetworkFilterAction;
