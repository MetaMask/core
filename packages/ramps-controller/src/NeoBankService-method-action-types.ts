/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NeoBankService } from './NeoBankService.js';

/**
 * Fetches an autoramp account via neobank-proxy
 * `GET /neobank/autoramps/{autoramp_id}` (MoonPay
 * `GET /api/autoramps/{autoramp_id}`).
 *
 * @param autorampId - MoonPay / Ramp API autoramp id.
 * @returns Remote snapshot for controller apply/refresh.
 */
export type NeoBankServiceGetAutorampAction = {
  type: `NeoBankService:getAutoramp`;
  handler: NeoBankService['getAutoramp'];
};

/**
 * Fetches deposit/transaction records for an autoramp via neobank-proxy
 * `GET /neobank/autoramp-transactions?autoramp_id={autoramp_id}` (MoonPay
 * `GET /api/autoramp-transactions`, response is a MoonPay `PagedList`).
 *
 * Used by the deposit poller to detect status changes (e.g. a payout settling
 * on Monad). Route + response shape track onramp-api PR #1124.
 *
 * @param autorampId - MoonPay / Ramp API autoramp id.
 * @returns Deposit snapshots for controller apply/refresh.
 */
export type NeoBankServiceGetAutorampTransactionsAction = {
  type: `NeoBankService:getAutorampTransactions`;
  handler: NeoBankService['getAutorampTransactions'];
};

/**
 * Registers a Pix address via neobank-proxy `POST /neobank/addresses/pix`.
 * Body is forwarded as opaque JSON (MoonPay address schema).
 *
 * @param body - Pix address registration payload.
 * @param options - Optional idempotency key.
 * @returns Parsed proxy JSON response.
 */
export type NeoBankServiceRegisterPixAddressAction = {
  type: `NeoBankService:registerPixAddress`;
  handler: NeoBankService['registerPixAddress'];
};

/**
 * Fetches an autoramp quote via neobank-proxy `GET /neobank/autoramps/quote`.
 *
 * @param query - Quote query params (forwarded as-is).
 * @returns Parsed proxy JSON response.
 */
export type NeoBankServiceGetAutorampQuoteAction = {
  type: `NeoBankService:getAutorampQuote`;
  handler: NeoBankService['getAutorampQuote'];
};

/**
 * Creates an autoramp from a signed quote via neobank-proxy
 * `POST /neobank/autoramps` (MoonPay `POST /api/autoramps`).
 *
 * @param body - CreateAutoramp / signed-quote payload (forwarded as-is).
 * @param options - Optional idempotency key.
 * @returns Remote snapshot for controller apply/refresh.
 */
export type NeoBankServiceCreateAutorampAction = {
  type: `NeoBankService:createAutoramp`;
  handler: NeoBankService['createAutoramp'];
};

/**
 * Fetches a quote for an existing autoramp via neobank-proxy
 * `GET /neobank/autoramps/{autoramp_id}/quote`.
 *
 * @param autorampId - Autoramp id.
 * @param query - Quote query params (forwarded as-is).
 * @returns Parsed proxy JSON response.
 */
export type NeoBankServiceGetAutorampQuoteForAutorampAction = {
  type: `NeoBankService:getAutorampQuoteForAutoramp`;
  handler: NeoBankService['getAutorampQuoteForAutoramp'];
};

/**
 * Attaches a signed quote to an autoramp via neobank-proxy
 * `POST /neobank/autoramps/{autoramp_id}/quotes`.
 *
 * @param autorampId - Autoramp id.
 * @param body - Quote attachment payload (forwarded as-is).
 * @param options - Optional idempotency key.
 * @returns Parsed proxy JSON response.
 */
export type NeoBankServiceAttachAutorampQuoteAction = {
  type: `NeoBankService:attachAutorampQuote`;
  handler: NeoBankService['attachAutorampQuote'];
};

/**
 * Fetches a customer by partner external id via neobank-proxy
 * `GET /neobank/customers/{external_id}/external`.
 *
 * @param externalId - Partner-assigned external customer id.
 * @returns Parsed proxy JSON response.
 */
export type NeoBankServiceGetCustomerByExternalIdAction = {
  type: `NeoBankService:getCustomerByExternalId`;
  handler: NeoBankService['getCustomerByExternalId'];
};

/**
 * Resolves Iron's internal customer id via neobank-proxy customer lookup,
 * using the MetaMask canonical profile id as the partner `external_id`.
 *
 * @returns Iron's internal customer id.
 */
export type NeoBankServiceGetMoonpayCustomerIdAction = {
  type: `NeoBankService:getMoonpayCustomerId`;
  handler: NeoBankService['getMoonpayCustomerId'];
};

/**
 * Checks whether a Monad Money Account address is already registered for the
 * given Iron customer.
 *
 * @param params - Customer id and address to check.
 * @param params.customerId - Iron / MoonPay customer UUID.
 * @param params.address - Money Account address.
 * @returns Active, disabled, or absent registration status.
 */
export type NeoBankServiceGetWalletRegistrationStatusAction = {
  type: `NeoBankService:getWalletRegistrationStatus`;
  handler: NeoBankService['getWalletRegistrationStatus'];
};

/**
 * Submits a signed Monad Money Account ownership proof via neobank-proxy
 * `POST /neobank/addresses/crypto/selfhosted`.
 *
 * @param params - Signed ownership proof.
 * @returns Registered wallet record.
 */
export type NeoBankServiceRegisterSelfHostedWalletAction = {
  type: `NeoBankService:registerSelfHostedWallet`;
  handler: NeoBankService['registerSelfHostedWallet'];
};

/**
 * Union of all NeoBankService action types.
 */
export type NeoBankServiceMethodActions =
  | NeoBankServiceGetAutorampAction
  | NeoBankServiceGetAutorampTransactionsAction
  | NeoBankServiceRegisterPixAddressAction
  | NeoBankServiceGetAutorampQuoteAction
  | NeoBankServiceCreateAutorampAction
  | NeoBankServiceGetAutorampQuoteForAutorampAction
  | NeoBankServiceAttachAutorampQuoteAction
  | NeoBankServiceGetCustomerByExternalIdAction
  | NeoBankServiceGetMoonpayCustomerIdAction
  | NeoBankServiceGetWalletRegistrationStatusAction
  | NeoBankServiceRegisterSelfHostedWalletAction;
