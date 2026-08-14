/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SubscriptionService } from './SubscriptionService.js';

/**
 * Fetches the user's subscriptions.
 *
 * @returns The subscriptions response.
 */
export type SubscriptionServiceGetSubscriptionsAction = {
  type: `SubscriptionService:getSubscriptions`;
  handler: SubscriptionService['getSubscriptions'];
};

/**
 * Cancels a subscription.
 *
 * @param params - The cancel subscription request.
 * @returns The updated subscription.
 */
export type SubscriptionServiceCancelSubscriptionAction = {
  type: `SubscriptionService:cancelSubscription`;
  handler: SubscriptionService['cancelSubscription'];
};

/**
 * Reverses a pending subscription cancellation.
 *
 * @param params - The uncancel subscription request.
 * @param params.subscriptionId - The subscription ID to uncancel.
 * @returns The updated subscription.
 */
export type SubscriptionServiceUnCancelSubscriptionAction = {
  type: `SubscriptionService:unCancelSubscription`;
  handler: SubscriptionService['unCancelSubscription'];
};

/**
 * Starts a card-paid subscription checkout session for the requested products
 * (e.g. Shield or Money Account Plus).
 *
 * @param request - The start subscription request.
 * @returns The checkout session response.
 */
export type SubscriptionServiceStartSubscriptionWithCardAction = {
  type: `SubscriptionService:startSubscriptionWithCard`;
  handler: SubscriptionService['startSubscriptionWithCard'];
};

/**
 * Starts a subscription with a crypto payment method.
 *
 * @param request - The start crypto subscription request.
 * @returns The created subscription response.
 * @throws If `products` is empty.
 * @throws If the request does not use exactly one of `rawTransaction`
 * (ERC-20 approval) or `delegationHash` (delegation).
 */
export type SubscriptionServiceStartSubscriptionWithCryptoAction = {
  type: `SubscriptionService:startSubscriptionWithCrypto`;
  handler: SubscriptionService['startSubscriptionWithCrypto'];
};

/**
 * Updates a subscription's card payment method.
 *
 * @param request - The update payment method request.
 * @returns The redirect URL response.
 */
export type SubscriptionServiceUpdatePaymentMethodCardAction = {
  type: `SubscriptionService:updatePaymentMethodCard`;
  handler: SubscriptionService['updatePaymentMethodCard'];
};

/**
 * Updates a subscription's crypto payment method.
 *
 * @param request - The update payment method request.
 */
export type SubscriptionServiceUpdatePaymentMethodCryptoAction = {
  type: `SubscriptionService:updatePaymentMethodCrypto`;
  handler: SubscriptionService['updatePaymentMethodCrypto'];
};

/**
 * Get the eligibility for a shield subscription.
 *
 * @param request - Optional request object containing user balance category to check cohort eligibility
 * @returns The eligibility for a shield subscription
 */
export type SubscriptionServiceGetSubscriptionsEligibilitiesAction = {
  type: `SubscriptionService:getSubscriptionsEligibilities`;
  handler: SubscriptionService['getSubscriptionsEligibilities'];
};

/**
 * Submit a user event. (e.g. shield modal viewed)
 *
 * @param request - Request object containing the event to submit.
 * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed, cohort: 'post_tx' }
 */
export type SubscriptionServiceSubmitUserEventAction = {
  type: `SubscriptionService:submitUserEvent`;
  handler: SubscriptionService['submitUserEvent'];
};

/**
 * Assign user to a cohort.
 *
 * @param request - Request object containing the cohort to assign the user to.
 * @example { cohort: 'post_tx' }
 */
export type SubscriptionServiceAssignUserToCohortAction = {
  type: `SubscriptionService:assignUserToCohort`;
  handler: SubscriptionService['assignUserToCohort'];
};

/**
 * Submit sponsorship intents to the Subscription Service backend.
 *
 * This is intended to be used together with the crypto subscription flow.
 * When the user has enabled the smart transaction feature, we will sponsor the gas fees for the subscription approval transaction.
 *
 * @param request - Request object containing the address and products.
 * @example { address: '0x1234567890123456789012345678901234567890', products: [ProductType.Shield] }
 */
export type SubscriptionServiceSubmitSponsorshipIntentsAction = {
  type: `SubscriptionService:submitSponsorshipIntents`;
  handler: SubscriptionService['submitSponsorshipIntents'];
};

/**
 * Link rewards to a subscription.
 *
 * @param request - Request object containing the reward account ID.
 * @example { rewardAccountId: 'eip155:1:0x1234567890123456789012345678901234567890' }
 * @returns The response from the API.
 */
export type SubscriptionServiceLinkRewardsAction = {
  type: `SubscriptionService:linkRewards`;
  handler: SubscriptionService['linkRewards'];
};

/**
 * Fetches subscription pricing information.
 *
 * @returns The pricing response.
 */
export type SubscriptionServiceGetPricingAction = {
  type: `SubscriptionService:getPricing`;
  handler: SubscriptionService['getPricing'];
};

/**
 * Fetches the billing portal URL.
 *
 * @returns The billing portal response.
 */
export type SubscriptionServiceGetBillingPortalUrlAction = {
  type: `SubscriptionService:getBillingPortalUrl`;
  handler: SubscriptionService['getBillingPortalUrl'];
};

/**
 * Union of all SubscriptionService action types.
 */
export type SubscriptionServiceMethodActions =
  | SubscriptionServiceGetSubscriptionsAction
  | SubscriptionServiceCancelSubscriptionAction
  | SubscriptionServiceUnCancelSubscriptionAction
  | SubscriptionServiceStartSubscriptionWithCardAction
  | SubscriptionServiceStartSubscriptionWithCryptoAction
  | SubscriptionServiceUpdatePaymentMethodCardAction
  | SubscriptionServiceUpdatePaymentMethodCryptoAction
  | SubscriptionServiceGetSubscriptionsEligibilitiesAction
  | SubscriptionServiceSubmitUserEventAction
  | SubscriptionServiceAssignUserToCohortAction
  | SubscriptionServiceSubmitSponsorshipIntentsAction
  | SubscriptionServiceLinkRewardsAction
  | SubscriptionServiceGetPricingAction
  | SubscriptionServiceGetBillingPortalUrlAction;
