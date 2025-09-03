import { KeyringTypes } from '@metamask/keyring-controller';
import { JsonRpcError } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';

import { EIP5792ErrorCode } from './constants';
import type { EIP5792Messenger } from './types';
import { getAccountKeyringType } from './utils';

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
