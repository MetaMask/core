import type { Caveat, Hex } from '@metamask/delegation-core';
import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import { numberToHex } from '@metamask/utils';

import type {
  DecodedPermission,
  PermissionType,
  PermissionDecoder,
  ValidateAndDecodeResult,
} from './types.js';

/**
 * Returns every permission decoder whose caveat-address pattern matches the
 * given enforcer list for the chain. Used when more than one permission type
 * can share the same enforcer set; the caller must disambiguate by validating
 * caveat terms (see {@link selectUniqueDecoderAndDecodedPermission}).
 *
 * @param args - The arguments to this function.
 * @param args.enforcers - List of enforcer contract addresses (hex strings).
 * @param args.permissionDecoders - The permission decoders for the chain.
 * @returns All decoders that match, possibly empty.
 */
export const findDecodersWithMatchingCaveatAddresses = ({
  enforcers,
  permissionDecoders,
}: {
  enforcers: Hex[];
  permissionDecoders: PermissionDecoder[];
}): PermissionDecoder[] => {
  return permissionDecoders.filter((decoder) =>
    decoder.caveatAddressesMatch(enforcers),
  );
};

type SuccessfulValidateAndDecodeResult = Extract<
  ValidateAndDecodeResult,
  { isValid: true }
>;

type DecoderAndDecodedPermission = {
  decoder: PermissionDecoder;
  rules: SuccessfulValidateAndDecodeResult['rules'];
  data: SuccessfulValidateAndDecodeResult['data'];
  expiry: SuccessfulValidateAndDecodeResult['expiry'];
};

/**
 * Runs {@link PermissionDecoder.validateAndDecodePermission} on each candidate
 * decoder. Use when several decoders share the same caveat addresses.
 *
 * @param args - The arguments to this function.
 * @param args.candidateDecoders - Decoders whose addresses already match the caveats.
 * @param args.caveats - Caveats from the delegation.
 * @returns The unique decoder and decoded expiry/data when exactly one decoder validates.
 * @throws If `candidateDecoders` is empty, if no decoder validates, or if more than one decoder validates.
 */
export const selectUniqueDecoderAndDecodedPermission = ({
  candidateDecoders,
  caveats,
}: {
  candidateDecoders: PermissionDecoder[];
  caveats: Caveat<Hex>[];
}): DecoderAndDecodedPermission => {
  if (candidateDecoders.length === 0) {
    throw new Error('Unable to identify permission type');
  }

  const successfulDecodingResult: DecoderAndDecodedPermission[] = [];

  const failedAttempts: { permissionType: PermissionType; error: Error }[] = [];

  for (const decoder of candidateDecoders) {
    const decodeResult = decoder.validateAndDecodePermission(caveats);
    if (decodeResult.isValid) {
      successfulDecodingResult.push({
        decoder,
        rules: decodeResult.rules,
        data: decodeResult.data,
        expiry: decodeResult.expiry,
      });
    } else {
      failedAttempts.push({
        permissionType: decoder.permissionType,
        error: decodeResult.error,
      });
    }
  }

  if (successfulDecodingResult.length === 1) {
    return successfulDecodingResult[0];
  }

  if (successfulDecodingResult.length > 1) {
    const types = successfulDecodingResult
      .map((result) => result.decoder.permissionType)
      .join(', ');
    throw new Error(
      `Multiple permission types validate the same delegation caveats: ${types}`,
    );
  }

  if (failedAttempts.length === 1) {
    throw failedAttempts[0].error;
  }

  const details = failedAttempts
    .map(
      (attempt) =>
        `${String(attempt.permissionType)}: ${attempt.error.message}`,
    )
    .join('; ');

  throw new Error(
    `No permission type could validate the delegation caveats. Attempts: ${details}`,
  );
};

/**
 * Reconstructs a {@link DecodedPermission} object from primitive values
 * obtained while decoding a permission context.
 *
 * @param args - The arguments to this function.
 * @param args.chainId - Chain ID.
 * @param args.permissionType - Identified permission type.
 * @param args.delegator - Address of the account delegating permission.
 * @param args.delegate - Address that will act under the granted permission.
 * @param args.authority - Authority identifier; must be ROOT_AUTHORITY.
 * @param args.expiry - Expiry timestamp (unix seconds) or null if unbounded.
 * @param args.data - Permission-specific decoded data payload.
 * @param args.justification - Human-readable justification for the permission.
 * @param args.specifiedOrigin - The origin reported in the request metadata.
 * @param args.rules - Rules recovered from caveats (e.g. redeemer allowlist).
 *
 * @returns The reconstructed {@link DecodedPermission}.
 */
export const reconstructDecodedPermission = ({
  chainId,
  permissionType,
  delegator,
  delegate,
  authority,
  expiry,
  data,
  justification,
  specifiedOrigin,
  rules,
}: {
  chainId: number;
  permissionType: PermissionType;
  delegator: Hex;
  delegate: Hex;
  authority: Hex;
  expiry: number | null;
  data: DecodedPermission['permission']['data'];
  justification: string;
  specifiedOrigin: string;
  rules?: DecodedPermission['rules'];
}): DecodedPermission => {
  if (authority !== ROOT_AUTHORITY) {
    throw new Error('Invalid authority');
  }

  const permission: DecodedPermission = {
    chainId: numberToHex(chainId),
    from: delegator,
    to: delegate,
    permission: {
      type: permissionType,
      data,
      justification,
    },
    expiry,
    origin: specifiedOrigin,
    ...(rules === undefined ? {} : { rules }),
  };

  return permission;
};
