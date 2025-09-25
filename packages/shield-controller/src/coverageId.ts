import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import fastStableStringify from 'fast-json-stable-stringify';

/**
 * Calculate the coverage ID for a transaction.
 *
 * @param txMeta - The transaction.
 * @returns The coverage ID.
 */
export function calculateTransactionCoverageId(
  txMeta: TransactionMeta,
): string {
  const body = [
    {
      from: txMeta.txParams.from,
      to: txMeta.txParams.to,
      value: txMeta.txParams.value,
      data: txMeta.txParams.data,
    },
  ];
  const chainId = Number(txMeta.chainId);
  const stringifiedInput = fastStableStringify({ body, chainId });
  return bytesToHex(sha256(utf8ToBytes(stringifiedInput)));
}

/**
 * Calculate the coverage ID for a signature request.
 *
 * @param signatureRequest - The signature request.
 * @returns The coverage ID.
 */
export function calculateSignatureCoverageId(
  signatureRequest: SignatureRequest,
): string {
  const method = signatureRequest.type;
  const { from, data, origin } = signatureRequest.messageParams;
  const hashInput = fastStableStringify({ data, method, from, origin });
  return bytesToHex(sha256(utf8ToBytes(hashInput)));
}
