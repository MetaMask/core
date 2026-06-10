import { KeyringController } from '@metamask/keyring-controller';
import type {
  KeyringControllerMessenger,
  KeyringControllerOptions,
} from '@metamask/keyring-controller';

import { keyringController } from './keyring-controller';

jest.mock('@metamask/keyring-controller', () => ({
  ...jest.requireActual('@metamask/keyring-controller'),
  KeyringController: jest.fn(),
}));

describe('keyringController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards keyringV2Builders to the KeyringController', () => {
    const keyringV2Builders = [
      Object.assign(jest.fn(), { type: 'Test Keyring V2' }),
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
