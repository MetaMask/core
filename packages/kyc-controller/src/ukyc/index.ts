export {
  UKYC_DERIVED_KEY_SIZES,
  UKYC_JWKS_PATH,
  UKYC_KDF_INFO,
  UKYC_LOCAL_USER_SECRET_PATH,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
  UKYC_STORAGE_ACCESS_TOKEN_AUDIENCE,
  UKYC_STORAGE_ACCESS_TOKEN_VERSION,
} from './constants.js';
export { base64UrlToBytes, toBase64Url } from './encoding.js';
export {
  deriveClientMaterial,
  encodeClientMaterial,
} from './deriveClientMaterial.js';
export type {
  EncodedUkycClientMaterial,
  UkycClientMaterial,
} from './deriveClientMaterial.js';
export { verifyJwtChain } from './jwtChain.js';
export type { Jwk, JwtChainPayload } from './jwtChain.js';
export {
  getOrCreateLocalUserSecret,
  hasLocalUserSecret,
  loadLocalUserSecret,
} from './localUserSecret.js';
export type { UkycLocalUserSecretStore } from './localUserSecret.js';
export {
  canonicalizeJson,
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './storageAccessToken.js';
export type {
  SignStorageAccessTokenParams,
  UkycStorageAccessToken,
  UkycStorageAccessTokenPayload,
  UkycStorageOperation,
  UkycTokenPresenter,
} from './storageAccessToken.js';
export { wrapEncryptionKey } from './wrapEncryptionKey.js';
export type { WrappedEncryptionKeyParts } from './wrapEncryptionKey.js';
export { wrapUserKey } from './wrapUserKey.js';
export { buildWrappedRelayPayload } from './wrappedRelayPayload.js';
export type { UkycWrappedRelayPayload } from './wrappedRelayPayload.js';
