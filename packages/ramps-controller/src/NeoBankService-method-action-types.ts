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
 * Union of all NeoBankService action types.
 */
export type NeoBankServiceMethodActions =
  | NeoBankServiceGetAutorampAction
  | NeoBankServiceRegisterPixAddressAction
  | NeoBankServiceGetAutorampQuoteAction
  | NeoBankServiceCreateAutorampAction
  | NeoBankServiceGetAutorampQuoteForAutorampAction
  | NeoBankServiceAttachAutorampQuoteAction
  | NeoBankServiceGetCustomerByExternalIdAction;
