import {
  formatWalletForUserStorageUsage,
  formatGroupForUserStorageUsage,
  parseWalletFromUserStorageResponse,
  parseGroupFromUserStorageResponse,
} from './format-utils';
import {
  assertValidUserStorageWallet,
  assertValidUserStorageGroup,
} from './validation';
import type { BackupAndSyncContext } from '../types';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { AccountGroupMultichainAccountObject } from '../../group';

jest.mock('./validation');

const mockAssertValidUserStorageWallet =
  assertValidUserStorageWallet as jest.MockedFunction<
    typeof assertValidUserStorageWallet
  >;
const mockAssertValidUserStorageGroup =
  assertValidUserStorageGroup as jest.MockedFunction<
    typeof assertValidUserStorageGroup
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
    } as any;

    mockWallet = {
      id: 'entropy:wallet-1',
      name: 'Test Wallet',
    } as any;

    mockGroup = {
      id: 'entropy:wallet-1/group-1',
      name: 'Test Group',
      metadata: { entropy: { groupIndex: 0 } },
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('formatWalletForUserStorageUsage', () => {
    it('should return wallet metadata when it exists', () => {
      const walletMetadata = {
        name: { value: 'Wallet Name', lastUpdatedAt: 123456 },
      };
      mockContext.controller.state.accountWalletsMetadata[mockWallet.id] =
        walletMetadata;

      const result = formatWalletForUserStorageUsage(mockContext, mockWallet);

      expect(result).toEqual(walletMetadata);
    });

    it('should return empty object when no wallet metadata exists', () => {
      const result = formatWalletForUserStorageUsage(mockContext, mockWallet);

      expect(result).toEqual({});
    });

    it('should merge extended metadata when provided', () => {
      const walletMetadata = {
        name: { value: 'Wallet Name', lastUpdatedAt: 123456 },
      };
      const extendedMetadata = {
        isLegacyAccountSyncingDisabled: true,
      };
      mockContext.controller.state.accountWalletsMetadata[mockWallet.id] =
        walletMetadata;

      const result = formatWalletForUserStorageUsage(
        mockContext,
        mockWallet,
        extendedMetadata,
      );

      expect(result).toEqual({
        ...walletMetadata,
        ...extendedMetadata,
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

      expect(result).toEqual({
        ...groupMetadata,
        groupIndex: 0,
      });
    });

    it('should return only groupIndex when no group metadata exists', () => {
      const result = formatGroupForUserStorageUsage(mockContext, mockGroup);

      expect(result).toEqual({
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

      mockAssertValidUserStorageWallet.mockImplementation(() => {});

      const result = parseWalletFromUserStorageResponse(walletString);

      expect(result).toEqual(walletData);
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

      mockAssertValidUserStorageGroup.mockImplementation(() => {});

      const result = parseGroupFromUserStorageResponse(groupString);

      expect(result).toEqual(groupData);
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

      mockAssertValidUserStorageWallet.mockImplementation(() => {
        throw 'String error'; // Throw a non-Error object
      });

      expect(() => parseWalletFromUserStorageResponse(walletString)).toThrow(
        'Error trying to parse wallet from user storage response: String error',
      );
    });

    it('should handle non-Error thrown objects in group parsing', () => {
      const groupData = { valid: 'data' };
      const groupString = JSON.stringify(groupData);

      mockAssertValidUserStorageGroup.mockImplementation(() => {
        throw { message: 'Object error' }; // Throw a non-Error object
      });

      expect(() => parseGroupFromUserStorageResponse(groupString)).toThrow(
        'Error trying to parse group from user storage response: [object Object]',
      );
    });
  });
});
