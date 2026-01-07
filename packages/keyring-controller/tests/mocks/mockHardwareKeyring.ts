import type { Hex } from '@metamask/utils';

export class HardwareWalletError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'HardwareWalletError';
    this.code = code;
  }
}

/**
 * Mock hardware keyring that supports signTypedData but throws an error.
 */
export class MockHardwareKeyring {
  static type = 'Mock Hardware';

  type = 'Mock Hardware';

  async getAccounts(): Promise<string[]> {
    return ['0x9876543210987654321098765432109876543210'];
  }

  async signTypedData(
    _address: Hex,
    _data: unknown,
    _opts: unknown,
  ): Promise<string> {
    throw new HardwareWalletError(
      'User rejected the request on hardware device',
      'USER_REJECTED',
    );
  }

  serialize = async (): Promise<{ type: string }> => ({
    type: this.type,
  });

  deserialize = async (_opts: unknown): Promise<void> => {
    // noop
  };
}

