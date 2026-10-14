export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * CAIP-19 asset reference for the native asset of an EVM chain that is
 * missing from the native asset map: the zero-address ERC-20 encoding used
 * for EVM natives without a SLIP-44 id. Only EVM chains get this fallback —
 * fabricating an `erc20:` asset on a non-EVM namespace would produce an ID
 * no data source ever writes. A fallback ID built from this reference is
 * never undeletable (see `AssetsController.#getUndeletableAssetIds`).
 */
export const UNKNOWN_EVM_NATIVE_ASSET_REFERENCE =
  `erc20:${ZERO_ADDRESS}` as const;
