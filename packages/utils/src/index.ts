export * from './assert.js';
export * from './base64.js';
export * from './caip-types.js';
export * from './checksum.js';
export * from './coercers.js';
export * from './collections.js';
export type * from './encryption-types.js';
export * from './hashing.js';
export {
  HexStruct,
  StrictHexStruct,
  HexAddressStruct,
  HexChecksumAddressStruct,
  isHexAddress,
  isHexChecksumAddress,
  isValidHexAddress,
  getChecksumAddress,
  isValidChecksumAddress,
} from './hex.js';
export * from './json.js';
export type * from './keyring.js';
export * from './logging.js';
export * from './misc.js';
export * from './mnemonic.js';
export type * from './opaque.js';
export * from './promise.js';
export * from './superstruct.js';
export * from './time.js';
export type * from './transaction-types.js';
export * from './versions.js';
export {
  toWei,
  fromWei,
  numberToString,
  getValueOfUnit,
  unitMap,
} from './unitsConversion.js';

// Re-exports for backwards compatibility.
export type { Hex } from '@metamask/byte-utils';
export {
  HEX_REGEX,
  STRICT_HEX_REGEX,
  add0x,
  assertIsHexString,
  assertIsStrictHexString,
  areUint8ArraysEqual,
  assertIsBytes,
  base64ToBytes,
  bigIntToBytes,
  bigIntToHex,
  bytesToBase64,
  bytesToBigInt,
  bytesToHex,
  bytesToNumber,
  bytesToSignedBigInt,
  bytesToString,
  concatBytes,
  createDataView,
  hexToBigInt,
  hexToNumber,
  hexToBytes,
  isBytes,
  isHexString,
  isStrictHexString,
  numberToBytes,
  numberToHex,
  remove0x,
  signedBigIntToBytes,
  stringToBytes,
  valueToBytes,
} from '@metamask/byte-utils';
export {
  ensureError,
  getErrorMessage,
  isErrorWithCode,
  isErrorWithMessage,
  isErrorWithStack,
  wrapError,
} from '@metamask/error-utils';
export type {
  AssertionErrorConstructor,
  Json,
  Mutable,
  NonEmptyArray,
  PartialOrAbsent,
  PublicInterface,
  RuntimeObject,
  RuntimeObject as PlainObject,
} from '@metamask/type-utils';
export {
  AssertionError,
  assert,
  assertExhaustive,
  isNonEmptyArray,
  getKnownPropertyNames,
  hasProperty,
  isNullOrUndefined,
  isObject,
  isPlainObject,
} from '@metamask/type-utils';
