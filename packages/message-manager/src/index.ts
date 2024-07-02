export { AbstractMessageManager } from './AbstractMessageManager';
export { PersonalMessageManager } from './PersonalMessageManager';
export { TypedMessageManager } from './TypedMessageManager';
export { EncryptionPublicKeyManager } from './EncryptionPublicKeyManager';
export { DecryptMessageManager } from './DecryptMessageManager';

export type {
  OriginalRequest,
  AbstractMessage,
  AbstractMessageParams,
  AbstractMessageParamsMetamask,
  MessageManagerState,
  SecurityProviderRequest,
} from './AbstractMessageManager';

export type {
  PersonalMessage,
  PersonalMessageParams,
  PersonalMessageParamsMetamask,
} from './PersonalMessageManager';

export type {
  DecryptMessage,
  DecryptMessageParams,
  DecryptMessageParamsMetamask,
} from './DecryptMessageManager';

export type {
  TypedMessage,
  TypedMessageParams,
  TypedMessageParamsMetamask,
  SignTypedDataMessageV3V4,
} from './TypedMessageManager';

export type {
  EncryptionPublicKey,
  EncryptionPublicKeyParams,
  EncryptionPublicKeyParamsMetamask,
} from './EncryptionPublicKeyManager';

export {
  normalizeMessageData,
  validateSignMessageData,
  validateTypedSignMessageDataV1,
  validateTypedSignMessageDataV3V4,
  validateEncryptionPublicKeyMessageData,
  validateDecryptedMessageData,
} from './utils';
