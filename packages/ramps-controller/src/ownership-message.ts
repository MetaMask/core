export type BuildOwnershipMessageRequest = {
  address: string;
  customerId: string;
  now: Date;
};

/**
 * Builds the proof-of-ownership message required to register a self-hosted
 * wallet with MoonPay Iron (`POST /addresses/crypto/selfhosted`).
 *
 * The returned string is the exact sentence that must be both signed (EIP-191
 * `personal_sign`) and sent, byte-for-byte, in the registration request body.
 * The date is always formatted as `DD/MM/YYYY` in UTC so a signature produced
 * just before UTC midnight is not reused with a stale date after rollover.
 *
 * @param request - Values embedded in the ownership message.
 * @param request.address - Wallet address, kept verbatim (no re-casing).
 * @param request.customerId - Iron customer id; must match the request body.
 * @param request.now - Reference time used to derive the UTC calendar date.
 * @returns The exact message to sign and submit.
 */
export function buildOwnershipMessage({
  address,
  customerId,
  now,
}: BuildOwnershipMessageRequest): string {
  const day = String(now.getUTCDate()).padStart(2, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = now.getUTCFullYear();

  return `I am verifying ownership of the wallet address ${address} as customer ${customerId}. This message was signed on ${day}/${month}/${year} to confirm my control over this wallet.`;
}
