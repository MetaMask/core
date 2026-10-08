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
 * Fetches autoramp accounts, following MoonPay `cursor` pages until the
 * list is complete.
 *
 * Pass `customerId` to scope the list to one MoonPay customer. Omitting it
 * asks the proxy for the partner-wide list. Each request uses MoonPay's
 * maximum `page_size`.
 *
 * @param params - Optional filters.
 * @param params.customerId - MoonPay customer id.
 * @returns Remote snapshots for every page.
 */
export type NeoBankServiceGetAutorampsAction = {
  type: `NeoBankService:getAutoramps`;
  handler: NeoBankService['getAutoramps'];
};

/**
 * Loads PIX deposit instructions for an autoramp.
 *
 * Calls `GET /neobank/autoramps/{id}` and reads the `type: Pix` rail
 * (`br_code`, `instruction`, optional `pix_key`). Returns null until MoonPay
 * has attached deposit rails (typically once the autoramp is Approved).
 *
 * @param autorampId - MoonPay autoramp id.
 * @returns PIX instructions, or null when the rail is not ready.
 */
export type NeoBankServiceGetPixDepositInstructionsAction = {
  type: `NeoBankService:getPixDepositInstructions`;
  handler: NeoBankService['getPixDepositInstructions'];
};

/**
 * Lists the newest page of transactions for one autoramp via
 * `GET /neobank/autoramp-transactions?autoramp_id=&sort_order=desc`.
 *
 * This is the first page only, not the full history. Poll `status`
 * (`Completed`, `Failed`, …). The deprecated `state` field is ignored.
 *
 * @param autorampId - MoonPay autoramp id.
 * @returns Transaction summaries from the newest page.
 */
export type NeoBankServiceListAutorampTransactionsAction = {
  type: `NeoBankService:listAutorampTransactions`;
  handler: NeoBankService['listAutorampTransactions'];
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
  | NeoBankServiceGetAutorampsAction
  | NeoBankServiceGetPixDepositInstructionsAction
  | NeoBankServiceListAutorampTransactionsAction
  | NeoBankServiceRegisterPixAddressAction
  | NeoBankServiceGetAutorampQuoteAction
  | NeoBankServiceCreateAutorampAction
  | NeoBankServiceGetAutorampQuoteForAutorampAction
  | NeoBankServiceAttachAutorampQuoteAction
  | NeoBankServiceGetCustomerByExternalIdAction
  | NeoBankServiceGetMoonpayCustomerIdAction
  | NeoBankServiceGetWalletRegistrationStatusAction
  | NeoBankServiceRegisterSelfHostedWalletAction;
