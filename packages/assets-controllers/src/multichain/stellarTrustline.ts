import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { KnownCaipNamespace, parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

/**
 * Returns true when the CAIP-2 chain id uses the Stellar namespace.
 *
 * @param chainId - CAIP-2 chain identifier.
 * @returns Whether this is a Stellar chain.
 */
export function isStellarCaipChain(chainId: CaipChainId): boolean {
  try {
    return parseCaipChainId(chainId).namespace === KnownCaipNamespace.Stellar;
  } catch {
    return false;
  }
}

/**
 * Returns true for Stellar classic (non-Soroban) fungible assets: `asset:CODE-ISSUER`.
 * Excludes native XLM (`slip44`), Soroban SEP-41 (`sep41:`), and other namespaces.
 *
 * @param caipAssetType - CAIP-19 asset type identifier.
 * @returns Whether this is a Stellar classic asset id.
 */
export function isStellarClassicAssetCaip19(caipAssetType: CaipAssetType): boolean {
  try {
    const parsed = parseCaipAssetType(caipAssetType);
    if (!isStellarCaipChain(parsed.chainId)) {
      return false;
    }
    return parsed.assetNamespace === 'asset';
  } catch {
    return false;
  }
}

/**
 * Stellar trust lines apply to classic (non-Soroban) assets only. Native XLM uses
 * slip44. Soroban tokens use `sep41:` and do not use trust-line semantics in this UI.
 *
 * @param caipAssetType - CAIP-19 asset type identifier.
 * @returns Whether trust-line active/inactive should be tracked for this asset.
 */
export function isStellarTrustlineTrackedAsset(
  caipAssetType: CaipAssetType,
): boolean {
  return isStellarClassicAssetCaip19(caipAssetType);
}
