import { KeyringTypes } from '@metamask/keyring-controller';
import { JsonRpcError, providerErrors } from '@metamask/rpc-errors';
import type { StructError } from '@metamask/superstruct';
import { any, validate } from '@metamask/superstruct';
import type { Hex, JsonRpcRequest } from '@metamask/utils';

import { EIP5792ErrorCode } from './constants';
import type { EIP5792Messenger } from './types';
import {
  getAccountKeyringType,
  validateAndNormalizeKeyholder,
  validateParams,
} from './utils';

jest.mock('@metamask/superstruct', () => ({
  ...jest.requireActual('@metamask/superstruct'),
  validate: jest.fn(),
}));

describe('getAccountKeyringType', () => {
  const mockMessenger = {
    call: jest.fn(),
  } as unknown as EIP5792Messenger;

  const mockAccountAddress =
    '0x1234567890123456789012345678901234567890' as Hex;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when account is found with valid keyring type', () => {
    it('should return the keyring type for HD account', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1234567890123456789012345678901234567890',
          metadata: {
            keyring: {
              type: KeyringTypes.hd,
            },
          },
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      const result = getAccountKeyringType(mockAccountAddress, mockMessenger);

      expect(result).toBe(KeyringTypes.hd);
      expect(mockMessenger.call).toHaveBeenCalledWith(
        'AccountsController:getState',
      );
    });

    it('should return the keyring type for simple account', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1234567890123456789012345678901234567890',
          metadata: {
            keyring: {
              type: KeyringTypes.simple,
            },
          },
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      const result = getAccountKeyringType(mockAccountAddress, mockMessenger);

      expect(result).toBe(KeyringTypes.simple);
    });

    it('should handle case-insensitive address comparison', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1234567890123456789012345678901234567890',
          metadata: {
            keyring: {
              type: KeyringTypes.hd,
            },
          },
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      const uppercaseAddress =
        '0X1234567890123456789012345678901234567890' as Hex;
      const result = getAccountKeyringType(uppercaseAddress, mockMessenger);

      expect(result).toBe(KeyringTypes.hd);
    });

    it('should find account when multiple accounts exist', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1111111111111111111111111111111111111111',
          metadata: {
            keyring: {
              type: KeyringTypes.simple,
            },
          },
        },
        'account-2': {
          address: '0x1234567890123456789012345678901234567890',
          metadata: {
            keyring: {
              type: KeyringTypes.hd,
            },
          },
        },
        'account-3': {
          address: '0x3333333333333333333333333333333333333333',
          metadata: {
            keyring: {
              type: KeyringTypes.simple,
            },
          },
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      const result = getAccountKeyringType(mockAccountAddress, mockMessenger);

      expect(result).toBe(KeyringTypes.hd);
    });
  });

  describe('when account is not found', () => {
    it('should throw JsonRpcError with RejectedUpgrade code when account does not exist', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1111111111111111111111111111111111111111',
          metadata: {
            keyring: {
              type: KeyringTypes.hd,
            },
          },
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow('EIP-7702 upgrade not supported as account type is unknown');
    });

    it('should throw JsonRpcError with RejectedUpgrade code when accounts object is empty', () => {
      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: {},
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow('EIP-7702 upgrade not supported as account type is unknown');
    });
  });

  describe('when account exists but has no keyring type', () => {
    it('should throw JsonRpcError when account has no metadata', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1234567890123456789012345678901234567890',
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow('EIP-7702 upgrade not supported as account type is unknown');
    });

    it('should throw JsonRpcError when account has no keyring metadata', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1234567890123456789012345678901234567890',
          metadata: {},
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow('EIP-7702 upgrade not supported as account type is unknown');
    });

    it('should throw JsonRpcError when account has no keyring type', () => {
      const mockAccounts = {
        'account-1': {
          address: '0x1234567890123456789012345678901234567890',
          metadata: {
            keyring: {},
          },
        },
      };

      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: mockAccounts,
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow('EIP-7702 upgrade not supported as account type is unknown');
    });
  });

  describe('error handling', () => {
    it('should throw JsonRpcError with correct error code', () => {
      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: {},
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(
        expect.objectContaining({
          code: EIP5792ErrorCode.RejectedUpgrade,
        }),
      );
    });

    it('should throw JsonRpcError with correct error message', () => {
      (mockMessenger.call as jest.Mock).mockReturnValue({
        internalAccounts: {
          accounts: {},
        },
      });

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(JsonRpcError);

      expect(() => {
        getAccountKeyringType(mockAccountAddress, mockMessenger);
      }).toThrow(
        expect.objectContaining({
          message: 'EIP-7702 upgrade not supported as account type is unknown',
        }),
      );
    });
  });
});

describe('validateAndNormalizeKeyholder', () => {
  const ADDRESS_MOCK = '0xABCDabcdABCDabcdABCDabcdABCDabcdABCDabcd';
  const REQUEST_MOCK = {} as JsonRpcRequest;

  let getAccountsMock: jest.MockedFn<
    (req: JsonRpcRequest) => Promise<string[]>
  >;

  beforeEach(() => {
    jest.resetAllMocks();

    getAccountsMock = jest.fn().mockResolvedValue([ADDRESS_MOCK]);
  });

  it('returns lowercase address', async () => {
    const result = await validateAndNormalizeKeyholder(
      ADDRESS_MOCK,
      REQUEST_MOCK,
      {
        getAccounts: getAccountsMock,
      },
    );

    expect(result).toBe(ADDRESS_MOCK.toLowerCase());
  });

  it('throws if address not returned by get accounts hook', async () => {
    getAccountsMock.mockResolvedValueOnce([]);

    await expect(
      validateAndNormalizeKeyholder(ADDRESS_MOCK, REQUEST_MOCK, {
        getAccounts: getAccountsMock,
      }),
    ).rejects.toThrow(providerErrors.unauthorized());
  });

  it('throws if address is not string', async () => {
    await expect(
      validateAndNormalizeKeyholder(123 as never, REQUEST_MOCK, {
        getAccounts: getAccountsMock,
      }),
    ).rejects.toThrow('Invalid parameters: must provide an Ethereum address.');
  });

  it('throws if address is empty string', async () => {
    await expect(
      validateAndNormalizeKeyholder('' as never, REQUEST_MOCK, {
        getAccounts: getAccountsMock,
      }),
    ).rejects.toThrow('Invalid parameters: must provide an Ethereum address.');
  });

  it('throws if address length is not 40', async () => {
    await expect(
      validateAndNormalizeKeyholder('0x123', REQUEST_MOCK, {
        getAccounts: getAccountsMock,
      }),
    ).rejects.toThrow('Invalid parameters: must provide an Ethereum address.');
  });
});

describe('validateParams', () => {
  const validateMock = jest.mocked(validate);
  const STRUCT_ERROR_MOCK = {
    failures: () => [
      {
        path: ['test1', 'test2'],
        message: 'test message',
      },
      {
        path: ['test3'],
        message: 'test message 2',
      },
    ],
  } as StructError;

  it('does now throw if superstruct returns no error', () => {
    validateMock.mockReturnValue([undefined, undefined]);
    expect(() => validateParams({}, any())).not.toThrow();
  });

  it('throws if superstruct returns error', () => {
    validateMock.mockReturnValue([STRUCT_ERROR_MOCK, undefined]);

    expect(() => validateParams({}, any())).toThrowErrorMatchingInlineSnapshot(`
        "Invalid params

        test1 > test2 - test message
        test3 - test message 2"
      `);
  });
});
