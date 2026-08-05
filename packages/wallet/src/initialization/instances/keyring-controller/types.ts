import type { KeyringControllerOptions } from '@metamask/keyring-controller';

import type { GenericEncryptor } from './encryptor.js';

/**
 * Per-instance options for the wallet's `KeyringController`. All fields are
 * optional; see the controller's `init` for the defaults applied when omitted.
 */
export type KeyringControllerInstanceOptions = {
  /**
   * Encryptor used to protect the keyring vault. Defaults to a PBKDF2 encryptor
   * configured with 600,000 iterations.
   */
  encryptor?: GenericEncryptor;
  /**
   * Builders for the keyrings the controller supports.
   */
  keyringBuilders?: KeyringControllerOptions['keyringBuilders'];
  /**
   * Builders for the v2 keyrings the controller supports.
   */
  keyringV2Builders?: KeyringControllerOptions['keyringV2Builders'];
};
