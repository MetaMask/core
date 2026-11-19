/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TransakService } from './TransakService.js';

export type TransakServiceSetApiKeyAction = {
  type: `TransakService:setApiKey`;
  handler: TransakService['setApiKey'];
};

export type TransakServiceSetAccessTokenAction = {
  type: `TransakService:setAccessToken`;
  handler: TransakService['setAccessToken'];
};

export type TransakServiceClearAccessTokenAction = {
  type: `TransakService:clearAccessToken`;
  handler: TransakService['clearAccessToken'];
};

export type TransakServiceSendUserOtpAction = {
  type: `TransakService:sendUserOtp`;
  handler: TransakService['sendUserOtp'];
};

export type TransakServiceVerifyUserOtpAction = {
  type: `TransakService:verifyUserOtp`;
  handler: TransakService['verifyUserOtp'];
};

export type TransakServiceLogoutAction = {
  type: `TransakService:logout`;
  handler: TransakService['logout'];
};

export type TransakServiceGetUserDetailsAction = {
  type: `TransakService:getUserDetails`;
  handler: TransakService['getUserDetails'];
};

export type TransakServiceGetBuyQuoteAction = {
  type: `TransakService:getBuyQuote`;
  handler: TransakService['getBuyQuote'];
};

export type TransakServiceGetKycRequirementAction = {
  type: `TransakService:getKycRequirement`;
  handler: TransakService['getKycRequirement'];
};

export type TransakServiceGetAdditionalRequirementsAction = {
  type: `TransakService:getAdditionalRequirements`;
  handler: TransakService['getAdditionalRequirements'];
};

export type TransakServiceCreateOrderAction = {
  type: `TransakService:createOrder`;
  handler: TransakService['createOrder'];
};

export type TransakServiceGetOrderAction = {
  type: `TransakService:getOrder`;
  handler: TransakService['getOrder'];
};

export type TransakServiceGetUserLimitsAction = {
  type: `TransakService:getUserLimits`;
  handler: TransakService['getUserLimits'];
};

/**
 * @deprecated Use {@link createWidgetUrl} instead. The OTT flow requires the
 * partner API key on the client and Transak is deprecating `request-ott`.
 * @returns The one-time token response.
 */
export type TransakServiceRequestOttAction = {
  type: `TransakService:requestOtt`;
  handler: TransakService['requestOtt'];
};

/**
 * @deprecated Use {@link createWidgetUrl} instead. This builds the widget
 * URL client-side and embeds the partner API key in it.
 * @param ottToken - The one-time token for widget authentication.
 * @param quote - The buy quote to pre-fill in the widget.
 * @param walletAddress - The destination wallet address.
 * @param extraParams - Optional additional URL parameters.
 * @returns The fully constructed widget URL string.
 */
export type TransakServiceGeneratePaymentWidgetUrlAction = {
  type: `TransakService:generatePaymentWidgetUrl`;
  handler: TransakService['generatePaymentWidgetUrl'];
};

/**
 * Creates a Transak payment widget URL through the ramps API proxy
 * (`POST {rampsBaseUrl}/providers/{providerId}/widget-url`). The proxy
 * injects the partner API key and derives the user IP server-side, so
 * neither leaves the backend. Replaces the OTT flow ({@link requestOtt} +
 * {@link generatePaymentWidgetUrl}).
 *
 * Requires both a Transak access token (user must be logged in to Transak)
 * and a MetaMask bearer token from `AuthenticationController`.
 *
 * @param quote - The buy quote to pre-fill in the widget.
 * @param walletAddress - The destination wallet address.
 * @param extraParams - Optional additional widget parameters (e.g. theming).
 * Keys must be on the proxy's allowlist or the request is rejected.
 * @returns The single-use widget URL (expires after 5 minutes).
 */
export type TransakServiceCreateWidgetUrlAction = {
  type: `TransakService:createWidgetUrl`;
  handler: TransakService['createWidgetUrl'];
};

export type TransakServiceSubmitPurposeOfUsageFormAction = {
  type: `TransakService:submitPurposeOfUsageForm`;
  handler: TransakService['submitPurposeOfUsageForm'];
};

export type TransakServicePatchUserAction = {
  type: `TransakService:patchUser`;
  handler: TransakService['patchUser'];
};

export type TransakServiceSubmitSsnDetailsAction = {
  type: `TransakService:submitSsnDetails`;
  handler: TransakService['submitSsnDetails'];
};

export type TransakServiceConfirmPaymentAction = {
  type: `TransakService:confirmPayment`;
  handler: TransakService['confirmPayment'];
};

export type TransakServiceGetTranslationAction = {
  type: `TransakService:getTranslation`;
  handler: TransakService['getTranslation'];
};

export type TransakServiceGetIdProofStatusAction = {
  type: `TransakService:getIdProofStatus`;
  handler: TransakService['getIdProofStatus'];
};

export type TransakServiceCancelOrderAction = {
  type: `TransakService:cancelOrder`;
  handler: TransakService['cancelOrder'];
};

export type TransakServiceCancelAllActiveOrdersAction = {
  type: `TransakService:cancelAllActiveOrders`;
  handler: TransakService['cancelAllActiveOrders'];
};

export type TransakServiceGetActiveOrdersAction = {
  type: `TransakService:getActiveOrders`;
  handler: TransakService['getActiveOrders'];
};

/**
 * Union of all TransakService action types.
 */
export type TransakServiceMethodActions =
  | TransakServiceSetApiKeyAction
  | TransakServiceSetAccessTokenAction
  | TransakServiceClearAccessTokenAction
  | TransakServiceSendUserOtpAction
  | TransakServiceVerifyUserOtpAction
  | TransakServiceLogoutAction
  | TransakServiceGetUserDetailsAction
  | TransakServiceGetBuyQuoteAction
  | TransakServiceGetKycRequirementAction
  | TransakServiceGetAdditionalRequirementsAction
  | TransakServiceCreateOrderAction
  | TransakServiceGetOrderAction
  | TransakServiceGetUserLimitsAction
  | TransakServiceRequestOttAction
  | TransakServiceGeneratePaymentWidgetUrlAction
  | TransakServiceCreateWidgetUrlAction
  | TransakServiceSubmitPurposeOfUsageFormAction
  | TransakServicePatchUserAction
  | TransakServiceSubmitSsnDetailsAction
  | TransakServiceConfirmPaymentAction
  | TransakServiceGetTranslationAction
  | TransakServiceGetIdProofStatusAction
  | TransakServiceCancelOrderAction
  | TransakServiceCancelAllActiveOrdersAction
  | TransakServiceGetActiveOrdersAction;
