import { MUSD_DECIMALS } from '@metamask/money-account-utils';
import type { Hex, Json } from '@metamask/utils';

import type { AutorampAccount, AutorampRemoteSnapshot } from './autorampAccount.js';

/**
 * Iron Pix DICT key types shown in "Add Pix beneficiary" tiles.
 * BANK_DETAILS intentionally omitted from v1.
 */
export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export const PIX_KEY_TYPES: ReadonlySet<PixKeyType> = new Set([
  'CPF',
  'CNPJ',
  'EMAIL',
  'PHONE',
  'EVP',
]);

/**
 * Recipient name shape required by Iron RegisterPixAddressRequest.
 */
export type PixRecipientName =
  | { type: 'Individual'; givenName: string; familyName: string }
  | { type: 'Business'; name: string };

/**
 * Mobile-facing input for {@link RampsController.sendPix}.
 */
export type SendPixRequest = {
  /** Exact-out destination amount as a decimal string (e.g. "100.00"). */
  amountOut: string;
  /** Destination fiat ISO code. v1: "BRL". */
  destinationCurrencyCode: string;
  /** Money Account smart account that holds vmUSD / signs the batch. */
  moneyAccountAddress: Hex;
  /** MoonPay / Iron customer UUID. */
  customerId: string;
  /** Pix destination. Maps 1:1 onto Iron RegisterPixAddressRequest.recipient. */
  pix: {
    keyType: PixKeyType;
    key: string;
    taxId: string;
    recipient: PixRecipientName;
    label?: string;
  };
  /**
   * Required client correlation / idempotency seed.
   * Seeds NeoBank Idempotency-Key values, vault withdraw `requestId`, and
   * sendPix in-flight dedupe.
   */
  clientRequestId: string;
};

/**
 * Result after confirmation sheet resolves inside vault withdraw.
 * `batchId` is not a handle to open UI afterward.
 */
export type SendPixResult = {
  pixAddressId: string;
  pixAddressStatus: string;
  autorampId: string;
  ironDepositAddress: Hex;
  amountInRaw: string;
  quoteId?: string;
  quoteValidUntil?: string;
  amountInDisplay?: string;
  amountOutDisplay?: string;
  destinationCurrencyCode: string;
  batchId: Hex;
  withdrawRequestId: string;
};

/** v1 destination currency allowlist. */
export const SEND_PIX_DESTINATION_CURRENCIES = new Set(['BRL']);

/**
 * Provisional Iron source identifiers for Monad mUSD offramp (plan Q1 open).
 * Reject quotes whose source fields disagree once present.
 */
export const SEND_PIX_SOURCE_CURRENCY_CODE = 'mUSD';
export const SEND_PIX_SOURCE_CURRENCY_CHAIN = 'monad';

/**
 * Quote expiry policy for exact-out Pix until product asks for slippage.
 */
export const SEND_PIX_RATE_EXPIRY_POLICY = 'Return';
export const SEND_PIX_EXPIRY_IN_HOURS = 1;

/** mUSD decimals for amount_in → amountInRaw (`MUSD_TOKEN.decimals`). */
export const SEND_PIX_MUSD_DECIMALS = MUSD_DECIMALS;

/**
 * Remote flag nesting under `remoteFeatureFlags.moneyAccount`.
 * Pix send kill switch (independent of other vault ops).
 */
export const MONEY_ACCOUNT_PIX_SEND_ENABLED_KEY = 'moneyAccountPixSendEnabled';
export const MONEY_ACCOUNT_WITHDRAW_ENABLED_KEY =
  'moneyAccountWithdrawEnabled';

export class SendPixError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SendPixError';
    this.code = code;
  }
}

export type SendPixFeatureFlagsLookup = {
  remoteFeatureFlags?: Record<string, Json | undefined>;
  localOverrides?: Record<string, Json | undefined>;
};

/**
 * Dual gate: Pix send + withdraw must both be enabled before NeoBank calls.
 *
 * @param state - Remote feature flag controller state (or subset).
 * @returns Whether sendPix may proceed.
 */
export function isSendPixEnabled(
  state: SendPixFeatureFlagsLookup | null | undefined,
): boolean {
  const flags = {
    ...(state?.remoteFeatureFlags ?? {}),
    ...(state?.localOverrides ?? {}),
  };
  const moneyAccount = flags.moneyAccount;
  if (
    !moneyAccount ||
    typeof moneyAccount !== 'object' ||
    Array.isArray(moneyAccount)
  ) {
    return false;
  }
  const nested = moneyAccount as Record<string, Json | undefined>;
  return (
    nested[MONEY_ACCOUNT_PIX_SEND_ENABLED_KEY] === true &&
    nested[MONEY_ACCOUNT_WITHDRAW_ENABLED_KEY] === true
  );
}

/**
 * Validates Mobile input before any network call.
 *
 * @param request - sendPix request.
 * @throws {SendPixError} when invalid.
 */
export function validateSendPixRequest(request: SendPixRequest): void {
  if (!request.clientRequestId?.trim()) {
    throw new SendPixError(
      'INVALID_CLIENT_REQUEST_ID',
      'clientRequestId is required',
    );
  }
  if (!request.customerId?.trim()) {
    throw new SendPixError('INVALID_CUSTOMER_ID', 'customerId is required');
  }
  if (!request.amountOut?.trim() || !isPositiveDecimal(request.amountOut)) {
    throw new SendPixError(
      'INVALID_AMOUNT_OUT',
      'amountOut must be a positive decimal string',
    );
  }
  if (
    !SEND_PIX_DESTINATION_CURRENCIES.has(
      request.destinationCurrencyCode?.trim().toUpperCase(),
    )
  ) {
    throw new SendPixError(
      'UNSUPPORTED_DESTINATION_CURRENCY',
      'destinationCurrencyCode must be BRL',
    );
  }
  if (!isHexAddress(request.moneyAccountAddress)) {
    throw new SendPixError(
      'INVALID_MONEY_ACCOUNT_ADDRESS',
      'moneyAccountAddress must be a Hex address',
    );
  }
  if (!PIX_KEY_TYPES.has(request.pix?.keyType)) {
    throw new SendPixError(
      'UNSUPPORTED_PIX_KEY_TYPE',
      'pix.keyType must be CPF, CNPJ, EMAIL, PHONE, or EVP',
    );
  }
  if (!request.pix?.key?.trim()) {
    throw new SendPixError('INVALID_PIX_KEY', 'pix.key is required');
  }
  if (!request.pix?.taxId?.trim()) {
    throw new SendPixError('INVALID_TAX_ID', 'pix.taxId is required');
  }
  validatePixRecipientName(request.pix.recipient, request.pix.keyType);
}

function validatePixRecipientName(
  recipient: PixRecipientName | undefined,
  keyType: PixKeyType,
): void {
  if (!recipient || typeof recipient !== 'object') {
    throw new SendPixError(
      'INVALID_PIX_RECIPIENT',
      'pix.recipient is required',
    );
  }
  if (recipient.type === 'Individual') {
    if (!recipient.givenName?.trim() || !recipient.familyName?.trim()) {
      throw new SendPixError(
        'INVALID_PIX_RECIPIENT',
        'Individual recipient requires givenName and familyName',
      );
    }
    if (keyType === 'CNPJ') {
      throw new SendPixError(
        'INVALID_PIX_RECIPIENT',
        'CNPJ keyType requires Business recipient',
      );
    }
    return;
  }
  if (recipient.type === 'Business') {
    if (!recipient.name?.trim()) {
      throw new SendPixError(
        'INVALID_PIX_RECIPIENT',
        'Business recipient requires name',
      );
    }
    if (keyType === 'CPF') {
      throw new SendPixError(
        'INVALID_PIX_RECIPIENT',
        'CPF keyType requires Individual recipient',
      );
    }
    return;
  }
  throw new SendPixError(
    'INVALID_PIX_RECIPIENT',
    'pix.recipient.type must be Individual or Business',
  );
}

/**
 * Builds Iron RegisterPixAddressRequest from camelCase Mobile input.
 *
 * @param request - sendPix request.
 * @returns Opaque JSON body for NeoBankService:registerPixAddress.
 */
export function buildRegisterPixAddressBody(
  request: SendPixRequest,
): Record<string, unknown> {
  const recipientName =
    request.pix.recipient.type === 'Individual'
      ? {
          type: 'Individual',
          given_name: request.pix.recipient.givenName,
          family_name: request.pix.recipient.familyName,
        }
      : {
          type: 'Business',
          name: request.pix.recipient.name,
        };

  const body: Record<string, unknown> = {
    customer_id: request.customerId,
    recipient: {
      tax_id: request.pix.taxId,
      recipient: recipientName,
      account: {
        type: request.pix.keyType,
        key: request.pix.key,
      },
    },
  };
  if (request.pix.label !== undefined) {
    body.label = request.pix.label;
  }
  return body;
}

/**
 * Builds createAutoramp POST body.
 *
 * ASSUMPTION (plan Q3 / Matt unconfirmed): neobank-proxy expects the wrapper
 * `{ signed_quote, customer_id }` matching #9851 NeoBankService fixtures, not
 * Iron's "POST signed quote JSON verbatim" docs. Prefer an explicit
 * `signed_quote` or `signature` field from the quote response; otherwise
 * forward the opaque quote object. Signed fields are never mutated.
 *
 * @param quote - Opaque getAutorampQuote response.
 * @param customerId - MoonPay customer id.
 * @returns Body for NeoBankService:createAutoramp.
 */
export function buildCreateAutorampBody(
  quote: unknown,
  customerId: string,
): Record<string, unknown> {
  let signedQuote: unknown = quote;
  if (quote && typeof quote === 'object' && !Array.isArray(quote)) {
    const q = quote as Record<string, unknown>;
    if (q.signed_quote !== undefined) {
      signedQuote = q.signed_quote;
    } else if (typeof q.signature === 'string') {
      signedQuote = q.signature;
    }
  }
  return {
    signed_quote: signedQuote,
    customer_id: customerId,
  };
}

/**
 * Builds getAutorampQuote query for exact-out Pix.
 *
 * @param request - sendPix request.
 * @param recipientAccountId - Registered Pix address id.
 * @returns Query params (no amount_in).
 */
export function buildAutorampQuoteQuery(
  request: SendPixRequest,
  recipientAccountId: string,
): Record<string, string | number | boolean> {
  return {
    customer_id: request.customerId,
    recipient_account_id: recipientAccountId,
    amount_out: request.amountOut,
    destination_currency_code: request.destinationCurrencyCode
      .trim()
      .toUpperCase(),
    source_currency_code: SEND_PIX_SOURCE_CURRENCY_CODE,
    source_currency_chain: SEND_PIX_SOURCE_CURRENCY_CHAIN,
    is_third_party: false,
    rate_expiry_policy: SEND_PIX_RATE_EXPIRY_POLICY,
    expiry_in_hours: SEND_PIX_EXPIRY_IN_HOURS,
  };
}

type QuoteAmount = {
  amount?: unknown;
  currency?: unknown;
  currency_code?: unknown;
  chain?: unknown;
  decimals?: unknown;
};

export type ParsedAutorampQuote = {
  amountInAmount: string;
  amountOutAmount?: string;
  quoteId?: string;
  validUntil?: string;
  signaturePresent: boolean;
  raw: unknown;
};

/**
 * Parses and validates a signed exact-out quote before create/withdraw.
 *
 * @param quote - Opaque getAutorampQuote response.
 * @param nowMs - Clock for expiry (injectable in tests).
 * @returns Parsed fields needed by sendPix.
 */
export function parseAndAssertAutorampQuote(
  quote: unknown,
  nowMs: number = Date.now(),
): ParsedAutorampQuote {
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) {
    throw new SendPixError('INVALID_QUOTE', 'Autoramp quote is malformed');
  }
  const q = quote as Record<string, unknown>;
  const amountIn = q.amount_in as QuoteAmount | undefined;
  if (!amountIn || typeof amountIn.amount !== 'string' || !amountIn.amount) {
    throw new SendPixError(
      'INVALID_QUOTE',
      'Autoramp quote missing amount_in.amount',
    );
  }

  const hasSignature =
    typeof q.signature === 'string' ||
    typeof q.signed_payload === 'object' ||
    typeof q.signed_quote === 'string' ||
    typeof q.signed_quote === 'object';
  if (!hasSignature) {
    throw new SendPixError(
      'INVALID_QUOTE',
      'Autoramp quote missing signature / signed body',
    );
  }

  assertQuoteSource(amountIn, q);

  const validUntil =
    typeof q.valid_until === 'string'
      ? q.valid_until
      : typeof q.validUntil === 'string'
        ? q.validUntil
        : undefined;
  if (validUntil) {
    const expiryMs = Date.parse(validUntil);
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
      throw new SendPixError('QUOTE_EXPIRED', 'Autoramp quote has expired');
    }
  }

  const amountOut = q.amount_out as QuoteAmount | undefined;

  return {
    amountInAmount: amountIn.amount,
    amountOutAmount:
      typeof amountOut?.amount === 'string' ? amountOut.amount : undefined,
    quoteId:
      typeof q.id === 'string'
        ? q.id
        : typeof q.quote_id === 'string'
          ? q.quote_id
          : undefined,
    validUntil,
    signaturePresent: true,
    raw: quote,
  };
}

function assertQuoteSource(
  amountIn: QuoteAmount,
  quoteRoot: Record<string, unknown>,
): void {
  const currency =
    (typeof amountIn.currency_code === 'string' && amountIn.currency_code) ||
    (typeof amountIn.currency === 'string' && amountIn.currency) ||
    (typeof quoteRoot.source_currency_code === 'string' &&
      quoteRoot.source_currency_code) ||
    undefined;
  const chain =
    (typeof amountIn.chain === 'string' && amountIn.chain) ||
    (typeof quoteRoot.source_currency_chain === 'string' &&
      quoteRoot.source_currency_chain) ||
    undefined;

  if (
    currency !== undefined &&
    currency.toLowerCase() !== SEND_PIX_SOURCE_CURRENCY_CODE.toLowerCase()
  ) {
    throw new SendPixError(
      'QUOTE_SOURCE_MISMATCH',
      `Quote source currency must be ${SEND_PIX_SOURCE_CURRENCY_CODE}`,
    );
  }
  if (
    chain !== undefined &&
    chain.toLowerCase() !== SEND_PIX_SOURCE_CURRENCY_CHAIN.toLowerCase()
  ) {
    throw new SendPixError(
      'QUOTE_SOURCE_MISMATCH',
      `Quote source chain must be ${SEND_PIX_SOURCE_CURRENCY_CHAIN}`,
    );
  }
  if (
    amountIn.decimals !== undefined &&
    amountIn.decimals !== SEND_PIX_MUSD_DECIMALS
  ) {
    throw new SendPixError(
      'QUOTE_DECIMALS_MISMATCH',
      `Quote amount_in decimals must be ${SEND_PIX_MUSD_DECIMALS}`,
    );
  }
}

/**
 * Converts quote amount_in.amount decimal string to mUSD base units.
 *
 * @param amountInAmount - Human decimal string from signed quote.
 * @returns Base units string for vault withdraw amountInRaw.
 */
export function parseMusdAmountInRaw(amountInAmount: string): string {
  if (!/^\d+(\.\d+)?$/u.test(amountInAmount)) {
    throw new SendPixError(
      'INVALID_AMOUNT_IN',
      'Quote amount_in.amount must be a non-negative decimal',
    );
  }
  const [wholePart, fractionPart = ''] = amountInAmount.split('.');
  if (fractionPart.length > SEND_PIX_MUSD_DECIMALS) {
    throw new SendPixError(
      'INVALID_AMOUNT_IN',
      `Quote amount_in.amount exceeds ${SEND_PIX_MUSD_DECIMALS} decimal places`,
    );
  }
  const paddedFraction = fractionPart.padEnd(SEND_PIX_MUSD_DECIMALS, '0');
  const raw = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/u, '');
  if (raw === '' || BigInt(raw) <= 0n) {
    throw new SendPixError(
      'INVALID_AMOUNT_IN',
      'Quote amount_in.amount must be greater than zero',
    );
  }
  return raw;
}

/**
 * Derives NeoBank / withdraw idempotency keys from clientRequestId.
 *
 * @param clientRequestId - Stable Mobile seed.
 * @returns Keys for pix register, autoramp create, and vault withdraw.
 */
export function deriveSendPixIds(clientRequestId: string): {
  pixIdempotencyKey: string;
  autorampIdempotencyKey: string;
  withdrawRequestId: string;
} {
  return {
    pixIdempotencyKey: `${clientRequestId}:pix`,
    autorampIdempotencyKey: `${clientRequestId}:autoramp`,
    withdrawRequestId: clientRequestId,
  };
}

export function isHexAddress(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/u.test(value);
}

function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(\.\d+)?$/u.test(value)) {
    return false;
  }
  return Number(value) > 0;
}

/**
 * Narrows Pix register response fields sendPix branches on.
 *
 * @param response - Opaque registerPixAddress JSON.
 * @returns id + status.
 */
export function parsePixAddressResponse(response: unknown): {
  id: string;
  status: string;
} {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new SendPixError(
      'INVALID_PIX_ADDRESS',
      'Pix address response is malformed',
    );
  }
  const body = response as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : undefined;
  const status = typeof body.status === 'string' ? body.status : undefined;
  if (!id || !status) {
    throw new SendPixError(
      'INVALID_PIX_ADDRESS',
      'Pix address response missing id or status',
    );
  }
  return { id, status };
}

/**
 * Asserts Pix destination is Registered before quoting.
 *
 * @param status - Pix address status.
 * @param pixAddressId - Address id for error context.
 */
export function assertPixAddressRegistered(
  status: string,
  pixAddressId: string,
): void {
  if (status === 'Registered') {
    return;
  }
  if (status === 'RegistrationPending') {
    throw new SendPixError(
      'PIX_DESTINATION_NOT_READY',
      `Pix address ${pixAddressId} is RegistrationPending`,
    );
  }
  if (status === 'RegistrationFailed') {
    throw new SendPixError(
      'PIX_REGISTRATION_FAILED',
      `Pix address ${pixAddressId} registration failed`,
    );
  }
  throw new SendPixError(
    'PIX_DESTINATION_NOT_READY',
    `Pix address ${pixAddressId} status is ${status}`,
  );
}

/**
 * Requires a usable crypto deposit Hex on the mapped autoramp snapshot.
 *
 * @param walletAddress - Mapped snapshot walletAddress.
 * @returns Hex deposit address.
 */
export function requireIronDepositAddress(
  walletAddress: string | undefined,
): Hex {
  if (!isHexAddress(walletAddress)) {
    throw new SendPixError(
      'MISSING_DEPOSIT_ADDRESS',
      'Autoramp snapshot missing crypto deposit Hex on walletAddress',
    );
  }
  return walletAddress;
}

/**
 * Dependencies for {@link executeSendPix}. Controllers inject messenger calls.
 */
export type SendPixDeps = {
  getFeatureFlagState: () => SendPixFeatureFlagsLookup | null | undefined;
  registerPixAddress: (
    body: Record<string, unknown>,
    options: { idempotencyKey: string },
  ) => Promise<unknown>;
  getAutorampQuote: (
    query: Record<string, string | number | boolean>,
  ) => Promise<unknown>;
  createAutoramp: (
    body: Record<string, unknown>,
    options: { idempotencyKey: string },
  ) => Promise<AutorampRemoteSnapshot>;
  addAutoramp: (input: {
    id: string;
    customerId: string;
    walletAddress: string;
    status?: string;
  }) => AutorampAccount;
  submitMoneyAccountVaultWithdraw: (request: {
    amountInRaw: string;
    moneyAccountAddress: Hex;
    recipient: Hex;
    requestId: string;
  }) => Promise<{ batchId: Hex }>;
  nowMs?: () => number;
};

/**
 * Orchestrates Pix register → quote → createAutoramp → vault withdraw.
 *
 * Confirmation UI is a side effect of
 * `TransactionPayController:submitMoneyAccountVaultWithdraw`
 * (`requireApproval: true`); this promise resolves after approval (or throws).
 *
 * @param request - Mobile sendPix input.
 * @param deps - Messenger / controller callbacks.
 * @returns Result including batchId after withdraw resolves.
 */
export async function executeSendPix(
  request: SendPixRequest,
  deps: SendPixDeps,
): Promise<SendPixResult> {
  validateSendPixRequest(request);

  if (!isSendPixEnabled(deps.getFeatureFlagState())) {
    throw new SendPixError(
      'PIX_SEND_DISABLED',
      'Money Account Pix send or vault withdraw is disabled',
    );
  }

  const ids = deriveSendPixIds(request.clientRequestId.trim());
  const nowMs = deps.nowMs?.() ?? Date.now();

  const pixResponse = await deps.registerPixAddress(
    buildRegisterPixAddressBody(request),
    { idempotencyKey: ids.pixIdempotencyKey },
  );
  const pixAddress = parsePixAddressResponse(pixResponse);
  assertPixAddressRegistered(pixAddress.status, pixAddress.id);

  const quoteRaw = await deps.getAutorampQuote(
    buildAutorampQuoteQuery(request, pixAddress.id),
  );
  const quote = parseAndAssertAutorampQuote(quoteRaw, nowMs);

  const snapshot = await deps.createAutoramp(
    buildCreateAutorampBody(quote.raw, request.customerId),
    { idempotencyKey: ids.autorampIdempotencyKey },
  );
  const ironDepositAddress = requireIronDepositAddress(snapshot.walletAddress);

  deps.addAutoramp({
    id: snapshot.id,
    customerId: snapshot.customerId,
    walletAddress: ironDepositAddress,
    status: snapshot.status,
  });

  // Re-check expiry immediately before withdraw (does not cover approval dwell).
  if (quote.validUntil) {
    parseAndAssertAutorampQuote(quote.raw, deps.nowMs?.() ?? Date.now());
  }

  const amountInRaw = parseMusdAmountInRaw(quote.amountInAmount);

  const { batchId } = await deps.submitMoneyAccountVaultWithdraw({
    amountInRaw,
    moneyAccountAddress: request.moneyAccountAddress,
    recipient: ironDepositAddress,
    requestId: ids.withdrawRequestId,
  });

  return {
    pixAddressId: pixAddress.id,
    pixAddressStatus: pixAddress.status,
    autorampId: snapshot.id,
    ironDepositAddress,
    amountInRaw,
    quoteId: quote.quoteId,
    quoteValidUntil: quote.validUntil,
    amountInDisplay: quote.amountInAmount,
    amountOutDisplay: quote.amountOutAmount,
    destinationCurrencyCode: request.destinationCurrencyCode
      .trim()
      .toUpperCase(),
    batchId,
    withdrawRequestId: ids.withdrawRequestId,
  };
}
