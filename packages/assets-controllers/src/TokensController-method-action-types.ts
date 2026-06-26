/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TokensController } from './TokensController';

/**
 * Adds a token to the stored token list.
 *
 * @param options - The method argument object.
 * @param options.address - Hex address of the token contract.
 * @param options.symbol - Symbol of the token.
 * @param options.decimals - Number of decimals the token uses.
 * @param options.name - Name of the token.
 * @param options.image - Image of the token.
 * @param options.interactingAddress - The address of the account to add a token to.
 * @param options.networkClientId - Network Client ID.
 * @param options.rwaData - Optional RWA data for the token.
 * @returns Current token list.
 */
export type TokensControllerAddTokenAction = {
  type: `TokensController:addToken`;
  handler: TokensController['addToken'];
};

/**
 * Add a batch of tokens.
 *
 * @param tokensToImport - Array of tokens to import.
 * @param networkClientId - Optional network client ID used to determine interacting chain ID.
 */
export type TokensControllerAddTokensAction = {
  type: `TokensController:addTokens`;
  handler: TokensController['addTokens'];
};

/**
 * Ignore a batch of tokens.
 *
 * @param tokenAddressesToIgnore - Array of token addresses to ignore.
 * @param networkClientId - Optional network client ID used to determine interacting chain ID.
 */
export type TokensControllerIgnoreTokensAction = {
  type: `TokensController:ignoreTokens`;
  handler: TokensController['ignoreTokens'];
};

/**
 * Adds a batch of detected tokens to the stored token list.
 *
 * @param incomingDetectedTokens - Array of detected tokens to be added or updated.
 * @param detectionDetails - An object containing the chain ID and address of the currently selected network on which the incomingDetectedTokens were detected.
 * @param detectionDetails.selectedAddress - the account address on which the incomingDetectedTokens were detected.
 * @param detectionDetails.chainId - the chainId on which the incomingDetectedTokens were detected.
 */
export type TokensControllerAddDetectedTokensAction = {
  type: `TokensController:addDetectedTokens`;
  handler: TokensController['addDetectedTokens'];
};

/**
 * Adds isERC721 field to token object. This is called when a user attempts to add tokens that
 * were previously added which do not yet had isERC721 field.
 *
 * @param tokenAddress - The contract address of the token requiring the isERC721 field added.
 * @param networkClientId - The network client ID of the network on which the token is detected.
 * @returns The new token object with the added isERC721 field.
 */
export type TokensControllerUpdateTokenTypeAction = {
  type: `TokensController:updateTokenType`;
  handler: TokensController['updateTokenType'];
};

/**
 * Adds a new suggestedAsset to the list of watched assets.
 * Parameters will be validated according to the asset type being watched.
 *
 * @param options - The method options.
 * @param options.asset - The asset to be watched. For now only ERC20 tokens are accepted.
 * @param options.type - The asset type.
 * @param options.interactingAddress - The address of the account that is requesting to watch the asset.
 * @param options.networkClientId - Network Client ID.
 * @param options.origin - The origin to set on the approval request.
 * @param options.pageMeta - The metadata for the page initiating the request.
 * @param options.requestMetadata - Metadata for the request, including pageMeta and origin.
 * @returns A promise that resolves if the asset was watched successfully, and rejects otherwise.
 */
export type TokensControllerWatchAssetAction = {
  type: `TokensController:watchAsset`;
  handler: TokensController['watchAsset'];
};

/**
 * Removes all tokens from the ignored list.
 */
export type TokensControllerClearIgnoredTokensAction = {
  type: `TokensController:clearIgnoredTokens`;
  handler: TokensController['clearIgnoredTokens'];
};

/**
 * Reset the controller state to the default state.
 */
export type TokensControllerResetStateAction = {
  type: `TokensController:resetState`;
  handler: TokensController['resetState'];
};

/**
 * Union of all TokensController action types.
 */
export type TokensControllerMethodActions =
  | TokensControllerAddTokenAction
  | TokensControllerAddTokensAction
  | TokensControllerIgnoreTokensAction
  | TokensControllerAddDetectedTokensAction
  | TokensControllerUpdateTokenTypeAction
  | TokensControllerWatchAssetAction
  | TokensControllerClearIgnoredTokensAction
  | TokensControllerResetStateAction;
