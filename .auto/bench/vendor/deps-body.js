// Vendored runtime dependencies for the getAssetIdsForMetadataFetch bench.
//
// These are VERBATIM blocks from the compiled JavaScript that MetaMask Mobile
// actually ships (read-only copies), so the bench measures the same dependency
// code the app runs. They are SHA-pinned by .auto/bench/vendor/SHA256SUM and
// the build fails if this file is edited.
//
// Sources:
//   - @metamask/utils@12.0.1 dist/caip-types.js:
//       CAIP_CHAIN_ID_REGEX, CAIP_NAMESPACE_REGEX, CAIP_REFERENCE_REGEX,
//       CAIP_ASSET_TYPE_REGEX, KnownCaipNamespace, isCaipChainId,
//       isCaipNamespace, isCaipReference, isCaipAssetType, parseCaipAssetType,
//       toCaipChainId
//   - @metamask/byte-utils@0.1.0 dist/hex.js:
//       isString, STRICT_HEX_REGEX, isStrictHexString
//   - @metamask/controller-utils@13.0.0 dist/util.js:
//       convertHexToDecimal
//
// The module exposes a CommonJS-style `exports` object provided by the
// assembler in build.mjs. `export` keywords are stripped by extraction; the
// code below is otherwise unchanged.

// ---- @metamask/utils@12.0.1 dist/caip-types.js ----
const CAIP_CHAIN_ID_REGEX = /^(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})$/u;
const CAIP_NAMESPACE_REGEX = /^[-a-z0-9]{3,8}$/u;
const CAIP_REFERENCE_REGEX = /^[-_a-zA-Z0-9]{1,32}$/u;
const CAIP_ASSET_TYPE_REGEX = /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32}))\/(?<assetNamespace>[-a-z0-9]{3,8}):(?<assetReference>[-.%a-zA-Z0-9]{1,128})$/u;
// Known CAIP namespaces.
var KnownCaipNamespace;
(function (KnownCaipNamespace) {
    /** BIP-122 (Bitcoin) compatible chains. */
    KnownCaipNamespace["Bip122"] = "bip122";
    /** Solana compatible chains */
    KnownCaipNamespace["Solana"] = "solana";
    /** Stellar compatible chains */
    KnownCaipNamespace["Stellar"] = "stellar";
    /** Tron compatible chains */
    KnownCaipNamespace["Tron"] = "tron";
    /** EIP-155 compatible chains. */
    KnownCaipNamespace["Eip155"] = "eip155";
    KnownCaipNamespace["Wallet"] = "wallet";
})(KnownCaipNamespace || (KnownCaipNamespace = {}));
function isCaipChainId(value) {
    return typeof value === 'string' && CAIP_CHAIN_ID_REGEX.test(value);
}
function isCaipNamespace(value) {
    return typeof value === 'string' && CAIP_NAMESPACE_REGEX.test(value);
}
function isCaipReference(value) {
    return typeof value === 'string' && CAIP_REFERENCE_REGEX.test(value);
}
function isCaipAssetType(value) {
    return typeof value === 'string' && CAIP_ASSET_TYPE_REGEX.test(value);
}
function parseCaipAssetType(caipAssetType) {
    const match = CAIP_ASSET_TYPE_REGEX.exec(caipAssetType);
    if (!match?.groups) {
        throw new Error('Invalid CAIP asset type.');
    }
    return {
        assetNamespace: match.groups.assetNamespace,
        assetReference: match.groups.assetReference,
        chainId: match.groups.chainId,
        chain: {
            namespace: match.groups.namespace,
            reference: match.groups.reference,
        },
    };
}
function toCaipChainId(namespace, reference) {
    if (!isCaipNamespace(namespace)) {
        throw new Error(`Invalid "namespace", must match: ${CAIP_NAMESPACE_REGEX.toString()}`);
    }
    if (!isCaipReference(reference)) {
        throw new Error(`Invalid "reference", must match: ${CAIP_REFERENCE_REGEX.toString()}`);
    }
    return `${namespace}:${reference}`;
}

// ---- @metamask/byte-utils@0.1.0 dist/hex.js ----
const STRICT_HEX_REGEX = /^0x[0-9a-f]+$/iu;
const isString = (value) => typeof value === 'string';
function isStrictHexString(value) {
    return isString(value) && STRICT_HEX_REGEX.test(value);
}

// ---- @metamask/controller-utils@13.0.0 dist/util.js ----
const convertHexToDecimal = (value = '0x0') => {
    if (isStrictHexString(value)) {
        return parseInt(value, 16);
    }
    return Number(value) ? Number(value) : 0;
};

// ---- Module exports (assembled by build.mjs) ----
