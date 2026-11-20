import type { Encryptor } from '@metamask/keyring-controller';
import { describe, expectTypeOf, it } from 'vitest';

import type { MfaRecoveryControllerOptions } from './MfaRecoveryController.js';
import type { PendingOperationEncryptor } from './types.js';

describe('PendingOperationEncryptor', () => {
  it('accepts the KeyringController encryptor', () => {
    expectTypeOf<Encryptor>().toExtend<PendingOperationEncryptor>();
    expectTypeOf<Encryptor>().toExtend<
      MfaRecoveryControllerOptions['encryptor']
    >();
  });

  it('rejects an encryptor missing a method', () => {
    expectTypeOf<
      Pick<Encryptor, 'importKey' | 'encryptWithKey'>
    >().not.toExtend<PendingOperationEncryptor>();
  });
});
