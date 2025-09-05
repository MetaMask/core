import {
  formatWalletForUserStorageUsage,
  formatGroupForUserStorageUsage,
  parseWalletFromUserStorageResponse,
  parseGroupFromUserStorageResponse,
  parseLegacyAccountFromUserStorageResponse,
} from './format-utils';
import {
  assertValidUserStorageWallet,
  assertValidUserStorageGroup,
  assertValidLegacyUserStorageAccount,
} from './validation';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { BackupAndSyncContext, UserStorageSyncedWallet } from '../types';

jest.mock('./validation');

const mockAssertValidUserStorageWallet =
  assertValidUserStorageWallet as jest.MockedFunction<
    typeof assertValidUserStorageWallet
  >;
const mockAssertValidUserStorageGroup =
  assertValidUserStorageGroup as jest.MockedFunction<
    typeof assertValidUserStorageGroup
  >;
const mockAssertValidLegacyUserStorageAccount =
  assertValidLegacyUserStorageAccount as jest.MockedFunction<
    typeof assertValidLegacyUserStorageAccount
  >;

describe('BackupAndSync - UserStorage - FormatUtils', () => {
  let mockContext: BackupAndSyncContext;
  let mockWallet: AccountWalletEntropyObject;
  let mockGroup: AccountGroupMultichainAccountObject;

  beforeEach(() => {
    mockContext = {
      controller: {
        state: {
          accountWalletsMetadata: {},
          accountGroupsMetadata: {},
        },
      },
    } as unknown as BackupAndSyncContext;

    mockWallet = {
      id: 'entropy:wallet-1',
      name: 'Test Wallet',
    } as unknown as AccountWalletEntropyObject;

    mockGroup = {
      id: 'entropy:wallet-1/group-1',
      name: 'Test Group',
      metadata: { entropy: { groupIndex: 0 } },
    } as unknown as AccountGroupMultichainAccountObject;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('formatWalletForUserStorageUsage', () => {
    it('should return wallet metadata when it exists', () => {
      const walletMetadata: UserStorageSyncedWallet = {
        name: { value: 'Wallet Name', lastUpdatedAt: 123456 },
      };
      mockContext.controller.state.accountWalletsMetadata[mockWallet.id] =
        walletMetadata;

      const result = formatWalletForUserStorageUsage(mockContext, mockWallet);

      expect(result).toStrictEqual({
        ...walletMetadata,
        isLegacyAccountSyncingDisabled: true,
      });
    });

    it('should return default object when no wallet metadata exists', () => {
      const result = formatWalletForUserStorageUsage(mockContext, mockWallet);

      expect(result).toStrictEqual({
        isLegacyAccountSyncingDisabled: true,
      });
    });
  });

  describe('formatGroupForUserStorageUsage', () => {
    it('should return group metadata with groupIndex', () => {
      const groupMetadata = {
        name: { value: 'Group Name', lastUpdatedAt: 123456 },
        pinned: { value: true, lastUpdatedAt: 123456 },
      };
      mockContext.controller.state.accountGroupsMetadata[mockGroup.id] =
        groupMetadata;

      const result = formatGroupForUserStorageUsage(mockContext, mockGroup);

      expect(result).toStrictEqual({
        ...groupMetadata,
        groupIndex: 0,
      });
    });

    it('should return only groupIndex when no group metadata exists', () => {
      const result = formatGroupForUserStorageUsage(mockContext, mockGroup);

      expect(result).toStrictEqual({
        groupIndex: 0,
      });
    });
  });

  describe('parseWalletFromUserStorageResponse', () => {
    it('should parse valid wallet JSON', () => {
      const walletData = {
        name: { value: 'Test Wallet', lastUpdatedAt: 123456 },
      };
      const walletString = JSON.stringify(walletData);

      mockAssertValidUserStorageWallet.mockImplementation(() => true);

      const result = parseWalletFromUserStorageResponse(walletString);

      expect(result).toStrictEqual(walletData);
      expect(mockAssertValidUserStorageWallet).toHaveBeenCalledWith(walletData);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = 'invalid json string';

      expect(() => parseWalletFromUserStorageResponse(invalidJson)).toThrow(
        'Error trying to parse wallet from user storage response:',
      );
    });

    it('should throw error when validation fails', () => {
      const walletData = { invalid: 'data' };
      const walletString = JSON.stringify(walletData);

      mockAssertValidUserStorageWallet.mockImplementation(() => {
        throw new Error('Validation failed');
      });

      expect(() => parseWalletFromUserStorageResponse(walletString)).toThrow(
        'Error trying to parse wallet from user storage response: Validation failed',
      );
    });
  });

  describe('parseGroupFromUserStorageResponse', () => {
    it('should parse valid group JSON', () => {
      const groupData = {
        groupIndex: 0,
        name: { value: 'Test Group', lastUpdatedAt: 123456 },
      };
      const groupString = JSON.stringify(groupData);

      mockAssertValidUserStorageGroup.mockImplementation(() => true);

      const result = parseGroupFromUserStorageResponse(groupString);

      expect(result).toStrictEqual(groupData);
      expect(mockAssertValidUserStorageGroup).toHaveBeenCalledWith(groupData);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = 'invalid json string';

      expect(() => parseGroupFromUserStorageResponse(invalidJson)).toThrow(
        'Error trying to parse group from user storage response:',
      );
    });

    it('should throw error when validation fails', () => {
      const groupData = { invalid: 'data' };
      const groupString = JSON.stringify(groupData);

      mockAssertValidUserStorageGroup.mockImplementation(() => {
        throw new Error('Validation failed');
      });

      expect(() => parseGroupFromUserStorageResponse(groupString)).toThrow(
        'Error trying to parse group from user storage response: Validation failed',
      );
    });

    it('should handle non-Error thrown objects in wallet parsing', () => {
      const walletData = { valid: 'data' };
      const walletString = JSON.stringify(walletData);

      /* eslint-disable @typescript-eslint/only-throw-error */
      mockAssertValidUserStorageWallet.mockImplementation(() => {
        throw 'String error'; // Throw a non-Error object
      });
      /* eslint-enable @typescript-eslint/only-throw-error */

      expect(() => parseWalletFromUserStorageResponse(walletString)).toThrow(
        'Error trying to parse wallet from user storage response: String error',
      );
    });

    it('should handle non-Error thrown objects in group parsing', () => {
      const groupData = { valid: 'data' };
      const groupString = JSON.stringify(groupData);

      /* eslint-disable @typescript-eslint/only-throw-error */
      mockAssertValidUserStorageGroup.mockImplementation(() => {
        throw { message: 'Object error' }; // Throw a non-Error object
      });
      /* eslint-enable @typescript-eslint/only-throw-error */

      expect(() => parseGroupFromUserStorageResponse(groupString)).toThrow(
        'Error trying to parse group from user storage response: [object Object]',
      );
    });
  });

  describe('parseLegacyAccountFromUserStorageResponse', () => {
    it('should parse valid legacy account JSON', () => {
      const accountData = {
        n: 'Test Account',
        a: '0x123456789abcdef',
        v: '1',
        i: 'test-id',
        nlu: 1234567890,
      };
      const accountString = JSON.stringify(accountData);

      mockAssertValidLegacyUserStorageAccount.mockImplementation(() => true);

      const result = parseLegacyAccountFromUserStorageResponse(accountString);

      expect(result).toStrictEqual(accountData);
      expect(mockAssertValidLegacyUserStorageAccount).toHaveBeenCalledWith(
        accountData,
      );
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = 'invalid json string';

      expect(() =>
        parseLegacyAccountFromUserStorageResponse(invalidJson),
      ).toThrow(
        'Error trying to parse legacy account from user storage response:',
      );
    });

    it('should throw error when validation fails', () => {
      const accountData = { invalid: 'data' };
      const accountString = JSON.stringify(accountData);

      mockAssertValidLegacyUserStorageAccount.mockImplementation(() => {
        throw new Error('Validation failed');
      });

      expect(() =>
        parseLegacyAccountFromUserStorageResponse(accountString),
      ).toThrow(
        'Error trying to parse legacy account from user storage response: Validation failed',
      );
    });

    it('should handle non-Error thrown objects in legacy account parsing', () => {
      const accountData = { valid: 'data' };
      const accountString = JSON.stringify(accountData);

      /* eslint-disable @typescript-eslint/only-throw-error */
      mockAssertValidLegacyUserStorageAccount.mockImplementation(() => {
        throw 'String error'; // Throw a non-Error object
      });
      /* eslint-enable @typescript-eslint/only-throw-error */

      expect(() =>
        parseLegacyAccountFromUserStorageResponse(accountString),
      ).toThrow(
        'Error trying to parse legacy account from user storage response: String error',
      );
    });
  });
});
