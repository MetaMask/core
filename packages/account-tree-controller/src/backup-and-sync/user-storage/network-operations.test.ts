import { SDK } from '@metamask/profile-sync-controller';

import {
  USER_STORAGE_WALLETS_FEATURE_KEY,
  USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY,
  USER_STORAGE_GROUPS_FEATURE_KEY,
} from './constants';
import {
  formatWalletForUserStorageUsage,
  formatGroupForUserStorageUsage,
  parseWalletFromUserStorageResponse,
  parseGroupFromUserStorageResponse,
} from './format-utils';
import {
  getWalletFromUserStorage,
  pushWalletToUserStorage,
  getAllGroupsFromUserStorage,
  getGroupFromUserStorage,
  pushGroupToUserStorage,
  pushGroupToUserStorageBatch,
  getLegacyUserStorageData,
} from './network-operations';
import { executeWithRetry } from './network-utils';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { BackupAndSyncContext } from '../types';
import { contextualLogger } from '../utils';

jest.mock('./format-utils');
jest.mock('./network-utils');
jest.mock('../utils', () => ({
  contextualLogger: {
    warn: jest.fn(),
  },
}));

const mockFormatWalletForUserStorageUsage =
  formatWalletForUserStorageUsage as jest.MockedFunction<
    typeof formatWalletForUserStorageUsage
  >;
const mockFormatGroupForUserStorageUsage =
  formatGroupForUserStorageUsage as jest.MockedFunction<
    typeof formatGroupForUserStorageUsage
  >;
const mockParseWalletFromUserStorageResponse =
  parseWalletFromUserStorageResponse as jest.MockedFunction<
    typeof parseWalletFromUserStorageResponse
  >;
const mockParseGroupFromUserStorageResponse =
  parseGroupFromUserStorageResponse as jest.MockedFunction<
    typeof parseGroupFromUserStorageResponse
  >;
const mockExecuteWithRetry = executeWithRetry as jest.MockedFunction<
  typeof executeWithRetry
>;

describe('BackupAndSync - UserStorage - NetworkOperations', () => {
  let mockContext: BackupAndSyncContext;
  let mockWallet: AccountWalletEntropyObject;
  let mockGroup: AccountGroupMultichainAccountObject;

  beforeEach(() => {
    mockContext = {
      messenger: {
        call: jest.fn(),
      },
      enableDebugLogging: false,
    } as any;

    mockWallet = {
      id: 'entropy:wallet-1',
      metadata: { entropy: { id: 'test-entropy-id' } },
    } as any;

    mockGroup = {
      id: 'entropy:wallet-1/group-1',
      metadata: { entropy: { groupIndex: 0 } },
    } as any;

    // Default mock implementation that just calls the operation
    mockExecuteWithRetry.mockImplementation(async (operation) => operation());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getWalletFromUserStorage', () => {
    it('should return parsed wallet data when found', async () => {
      const walletData = '{"name":{"value":"Test Wallet"}}';
      const parsedWallet = { name: { value: 'Test Wallet' } } as any;

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(walletData);
      mockParseWalletFromUserStorageResponse.mockReturnValue(parsedWallet);

      const result = await getWalletFromUserStorage(
        mockContext,
        'test-entropy-id',
      );

      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
        `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
        'test-entropy-id',
      );
      expect(mockParseWalletFromUserStorageResponse).toHaveBeenCalledWith(
        walletData,
      );
      expect(result).toBe(parsedWallet);
    });

    it('should return null when no wallet data found', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(null);

      const result = await getWalletFromUserStorage(
        mockContext,
        'test-entropy-id',
      );

      expect(result).toBeNull();
      expect(mockParseWalletFromUserStorageResponse).not.toHaveBeenCalled();
    });

    it('should return null when parsing fails', async () => {
      const walletData = 'invalid json';
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(walletData);
      mockParseWalletFromUserStorageResponse.mockImplementation(() => {
        throw new Error('Parse error');
      });
      mockContext.enableDebugLogging = true;

      const result = await getWalletFromUserStorage(
        mockContext,
        'test-entropy-id',
      );

      expect(result).toBeNull();
    });

    it('covers non-Error exception handling in wallet parsing debug logging', async () => {
      // Set up context with debug logging enabled
      const debugContext = {
        ...mockContext,
        enableDebugLogging: true,
      };

      // Mock executeWithRetry to pass through the function directly
      mockExecuteWithRetry.mockImplementation(async (fn) => fn());

      // Set up messenger to return wallet data
      jest
        .spyOn(debugContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue('wallet-data');

      // Mock the parser to throw a non-Error object
      mockParseWalletFromUserStorageResponse.mockImplementation(() => {
        throw 'String error for wallet parsing';
      });

      const result = await getWalletFromUserStorage(
        debugContext,
        'test-entropy-id',
      );

      expect(result).toBeNull();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Failed to parse wallet data from user storage: String error for wallet parsing',
      );
    });
  });

  describe('pushWalletToUserStorage', () => {
    it('should format and push wallet to user storage', async () => {
      const formattedWallet = { name: { value: 'Formatted Wallet' } } as any;

      mockFormatWalletForUserStorageUsage.mockReturnValue(formattedWallet);
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(undefined);

      await pushWalletToUserStorage(mockContext, mockWallet);

      expect(mockFormatWalletForUserStorageUsage).toHaveBeenCalledWith(
        mockContext,
        mockWallet,
        undefined,
      );
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performSetStorage',
        `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
        JSON.stringify(formattedWallet),
        'test-entropy-id',
      );
    });

    it('should include extended metadata when provided', async () => {
      const formattedWallet = { name: { value: 'Formatted Wallet' } } as any;
      const extendedMetadata = { isLegacyAccountSyncingDisabled: true };

      mockFormatWalletForUserStorageUsage.mockReturnValue(formattedWallet);

      await pushWalletToUserStorage(mockContext, mockWallet, extendedMetadata);

      expect(mockFormatWalletForUserStorageUsage).toHaveBeenCalledWith(
        mockContext,
        mockWallet,
        extendedMetadata,
      );
    });
  });

  describe('getAllGroupsFromUserStorage', () => {
    it('should return parsed groups array when found', async () => {
      const groupsData = ['{"groupIndex":0}', '{"groupIndex":1}'];
      const parsedGroups = [{ groupIndex: 0 }, { groupIndex: 1 }] as any;

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(groupsData);
      mockParseGroupFromUserStorageResponse
        .mockReturnValueOnce(parsedGroups[0])
        .mockReturnValueOnce(parsedGroups[1]);

      const result = await getAllGroupsFromUserStorage(
        mockContext,
        'test-entropy-id',
      );

      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performGetStorageAllFeatureEntries',
        USER_STORAGE_GROUPS_FEATURE_KEY,
        'test-entropy-id',
      );
      expect(result).toStrictEqual(parsedGroups);
    });

    it('should return empty array when no group data found', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(null);

      const result = await getAllGroupsFromUserStorage(
        mockContext,
        'test-entropy-id',
      );

      expect(result).toStrictEqual([]);
    });

    it('should filter out invalid groups when parsing fails', async () => {
      const groupsData = [
        '{"groupIndex":0}',
        'invalid json',
        '{"groupIndex":1}',
      ];
      const validGroups = [{ groupIndex: 0 }, { groupIndex: 1 }] as any;

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(groupsData);
      mockParseGroupFromUserStorageResponse
        .mockReturnValueOnce(validGroups[0])
        .mockImplementationOnce(() => {
          throw new Error('Parse error');
        })
        .mockReturnValueOnce(validGroups[1]);
      mockContext.enableDebugLogging = true;

      const result = await getAllGroupsFromUserStorage(
        mockContext,
        'test-entropy-id',
      );

      expect(result).toStrictEqual(validGroups);
    });

    it('covers non-Error exception handling in getAllGroups debug logging', async () => {
      // Set up context with debug logging enabled
      const debugContext = {
        ...mockContext,
        enableDebugLogging: true,
      };

      // Mock executeWithRetry to pass through the function directly
      mockExecuteWithRetry.mockImplementation(async (fn) => fn());

      // Set up messenger to return groups data with one invalid entry
      jest
        .spyOn(debugContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(['valid-json', 'invalid-json']);

      // Mock the parser - first call succeeds, second throws non-Error
      mockParseGroupFromUserStorageResponse
        .mockReturnValueOnce({ groupIndex: 0 } as any)
        .mockImplementationOnce(() => {
          throw 'String error for group parsing';
        });

      const result = await getAllGroupsFromUserStorage(
        debugContext,
        'test-entropy-id',
      );

      expect(result).toStrictEqual([{ groupIndex: 0 }]);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Failed to parse group data from user storage: String error for group parsing',
      );
    });
  });

  describe('getGroupFromUserStorage', () => {
    it('should return parsed group when found', async () => {
      const groupData = '{"groupIndex":0}';
      const parsedGroup = { groupIndex: 0 } as any;

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(groupData);
      mockParseGroupFromUserStorageResponse.mockReturnValue(parsedGroup);

      const result = await getGroupFromUserStorage(
        mockContext,
        'test-entropy-id',
        0,
      );

      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
        `${USER_STORAGE_GROUPS_FEATURE_KEY}.0`,
        'test-entropy-id',
      );
      expect(result).toBe(parsedGroup);
    });

    it('should return null when parsing fails', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue('invalid json');
      mockParseGroupFromUserStorageResponse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await getGroupFromUserStorage(
        mockContext,
        'test-entropy-id',
        0,
      );

      expect(result).toBeNull();
    });

    it('should return null when there is no group data', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(null);

      const result = await getGroupFromUserStorage(
        mockContext,
        'test-entropy-id',
        0,
      );

      expect(result).toBeNull();
    });

    it('should log debug warning when parsing fails and debug logging is enabled', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue('invalid json');
      mockParseGroupFromUserStorageResponse.mockImplementation(() => {
        throw new Error('Parse error');
      });
      mockContext.enableDebugLogging = true;

      const result = await getGroupFromUserStorage(
        mockContext,
        'test-entropy-id',
        0,
      );

      expect(result).toBeNull();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Failed to parse group data from user storage: Parse error',
      );
    });

    it('should handle non-Error objects in debug logging', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue('invalid json');
      mockParseGroupFromUserStorageResponse.mockImplementation(() => {
        throw 'String error'; // Non-Error object
      });
      mockContext.enableDebugLogging = true;

      const result = await getGroupFromUserStorage(
        mockContext,
        'test-entropy-id',
        0,
      );

      expect(result).toBeNull();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Failed to parse group data from user storage: String error',
      );
    });
  });

  describe('pushGroupToUserStorage', () => {
    it('should format and push group to user storage', async () => {
      const formattedGroup = {
        groupIndex: 0,
        name: { value: 'Test Group' },
      } as any;

      mockFormatGroupForUserStorageUsage.mockReturnValue(formattedGroup);

      await pushGroupToUserStorage(mockContext, mockGroup, 'test-entropy-id');

      expect(mockFormatGroupForUserStorageUsage).toHaveBeenCalledWith(
        mockContext,
        mockGroup,
      );
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performSetStorage',
        `${USER_STORAGE_GROUPS_FEATURE_KEY}.0`,
        JSON.stringify(formattedGroup),
        'test-entropy-id',
      );
    });
  });

  describe('pushGroupToUserStorageBatch', () => {
    it('should format and batch push groups to user storage', async () => {
      const groups = [
        mockGroup,
        { ...mockGroup, metadata: { entropy: { groupIndex: 1 } } },
      ] as any;
      const formattedGroups = [
        { groupIndex: 0, name: { value: 'Group 1' } },
        { groupIndex: 1, name: { value: 'Group 2' } },
      ] as any;

      mockFormatGroupForUserStorageUsage
        .mockReturnValueOnce(formattedGroups[0])
        .mockReturnValueOnce(formattedGroups[1]);

      await pushGroupToUserStorageBatch(mockContext, groups, 'test-entropy-id');

      expect(mockFormatGroupForUserStorageUsage).toHaveBeenCalledTimes(2);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performBatchSetStorage',
        USER_STORAGE_GROUPS_FEATURE_KEY,
        [
          ['0', JSON.stringify(formattedGroups[0])],
          ['1', JSON.stringify(formattedGroups[1])],
        ],
        'test-entropy-id',
      );
    });
  });

  describe('getLegacyUserStorageData', () => {
    it('should return parsed legacy account data', async () => {
      const rawAccountsData = [
        '{"a":"address1","n":"name1","nlu":123}',
        '{"a":"address2","n":"name2","nlu":456}',
      ];
      const expectedData = [
        { a: 'address1', n: 'name1', nlu: 123 },
        { a: 'address2', n: 'name2', nlu: 456 },
      ];

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(rawAccountsData);

      const result = await getLegacyUserStorageData(
        mockContext,
        'test-entropy-id',
      );

      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:performGetStorageAllFeatureEntries',
        SDK.USER_STORAGE_FEATURE_NAMES.accounts,
        'test-entropy-id',
      );
      expect(result).toStrictEqual(expectedData);
    });

    it('should return empty array when no legacy data found', async () => {
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(null);

      const result = await getLegacyUserStorageData(
        mockContext,
        'test-entropy-id',
      );

      expect(result).toStrictEqual([]);
    });
  });
});
