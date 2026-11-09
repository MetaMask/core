import { KeyringController } from '@metamask/keyring-controller';
import type {
  KeyringControllerMessenger,
  KeyringControllerOptions,
} from '@metamask/keyring-controller';
import { describe, expect, it, vi } from 'vitest';

import { keyringController } from './keyring-controller.js';

vi.mock(import('@metamask/keyring-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  KeyringController: vi.fn(),
}));

describe('keyringController', () => {
  it('forwards keyringV2Builders to the KeyringController', () => {
    const keyringV2Builders = [
      Object.assign(vi.fn(), { type: 'Test Keyring V2' }),
    ] as KeyringControllerOptions['keyringV2Builders'];

    keyringController.init({
      state: undefined,
      messenger: {} as KeyringControllerMessenger,
      options: { keyringV2Builders },
    });

    expect(KeyringController).toHaveBeenCalledWith(
      expect.objectContaining({ keyringV2Builders }),
    );
  });
});
