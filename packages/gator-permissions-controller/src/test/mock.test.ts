import {
  mockGatorPermissionsStorageEntriesFactory,
  type MockGatorPermissionsStorageEntriesConfig,
} from './mocks';

describe('mockGatorPermissionsStorageEntriesFactory', () => {
  it('should create mock storage entries for all permission types', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 2,
        nativeTokenPeriodic: 1,
        erc20TokenStream: 3,
        erc20TokenPeriodic: 1,
        custom: {
          count: 2,
          data: [
            { customField1: 'value1', customField2: 123 },
            { customField3: 'value3', customField4: true },
          ],
        },
      },
      '0x5': {
        nativeTokenStream: 1,
        nativeTokenPeriodic: 2,
        erc20TokenStream: 1,
        erc20TokenPeriodic: 2,
        custom: {
          count: 1,
          data: [{ customField5: 'value5' }],
        },
      },
    };

    const result = mockGatorPermissionsStorageEntriesFactory(config);

    expect(result).toHaveLength(16);

    // Check that all entries have the correct chainId
    const chainIds = result.map((entry) => entry.permissionResponse.chainId);
    expect(chainIds).toContain('0x1');
    expect(chainIds).toContain('0x5');
  });

  it('should create entries with correct permission types', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 1,
        nativeTokenPeriodic: 1,
        erc20TokenStream: 1,
        erc20TokenPeriodic: 1,
        custom: {
          count: 1,
          data: [{ testField: 'testValue' }],
        },
      },
    };

    const result = mockGatorPermissionsStorageEntriesFactory(config);

    expect(result).toHaveLength(5);

    // Check native-token-stream permission
    const nativeTokenStreamEntry = result.find(
      (entry) =>
        entry.permissionResponse.permission.type === 'native-token-stream',
    );
    expect(nativeTokenStreamEntry).toBeDefined();
    expect(
      nativeTokenStreamEntry?.permissionResponse.permission.data,
    ).toMatchObject({
      maxAmount: '0x22b1c8c1227a0000',
      initialAmount: '0x6f05b59d3b20000',
      amountPerSecond: '0x6f05b59d3b20000',
      startTime: 1747699200,
      justification:
        'This is a very important request for streaming allowance for some very important thing',
    });

    // Check native-token-periodic permission
    const nativeTokenPeriodicEntry = result.find(
      (entry) =>
        entry.permissionResponse.permission.type === 'native-token-periodic',
    );
    expect(nativeTokenPeriodicEntry).toBeDefined();
    expect(
      nativeTokenPeriodicEntry?.permissionResponse.permission.data,
    ).toMatchObject({
      periodAmount: '0x22b1c8c1227a0000',
      periodDuration: 1747699200,
      startTime: 1747699200,
      justification:
        'This is a very important request for streaming allowance for some very important thing',
    });

    // Check erc20-token-stream permission
    const erc20TokenStreamEntry = result.find(
      (entry) =>
        entry.permissionResponse.permission.type === 'erc20-token-stream',
    );
    expect(erc20TokenStreamEntry).toBeDefined();
    expect(
      erc20TokenStreamEntry?.permissionResponse.permission.data,
    ).toMatchObject({
      initialAmount: '0x22b1c8c1227a0000',
      maxAmount: '0x6f05b59d3b20000',
      amountPerSecond: '0x6f05b59d3b20000',
      startTime: 1747699200,
      tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
      justification:
        'This is a very important request for streaming allowance for some very important thing',
    });

    // Check erc20-token-periodic permission
    const erc20TokenPeriodicEntry = result.find(
      (entry) =>
        entry.permissionResponse.permission.type === 'erc20-token-periodic',
    );
    expect(erc20TokenPeriodicEntry).toBeDefined();
    expect(
      erc20TokenPeriodicEntry?.permissionResponse.permission.data,
    ).toMatchObject({
      periodAmount: '0x22b1c8c1227a0000',
      periodDuration: 1747699200,
      startTime: 1747699200,
      tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
      justification:
        'This is a very important request for streaming allowance for some very important thing',
    });

    // Check custom permission
    const customEntry = result.find(
      (entry) => entry.permissionResponse.permission.type === 'custom',
    );
    expect(customEntry).toBeDefined();
    expect(customEntry?.permissionResponse.permission.data).toMatchObject({
      justification:
        'This is a very important request for streaming allowance for some very important thing',
      testField: 'testValue',
    });
  });

  it('should handle empty counts for all permission types', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 0,
        nativeTokenPeriodic: 0,
        erc20TokenStream: 0,
        erc20TokenPeriodic: 0,
        custom: {
          count: 0,
          data: [],
        },
      },
    };

    const result = mockGatorPermissionsStorageEntriesFactory(config);

    expect(result).toHaveLength(0);
  });

  it('should handle multiple chain IDs', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 1,
        nativeTokenPeriodic: 0,
        erc20TokenStream: 0,
        erc20TokenPeriodic: 0,
        custom: {
          count: 0,
          data: [],
        },
      },
      '0x5': {
        nativeTokenStream: 0,
        nativeTokenPeriodic: 1,
        erc20TokenStream: 0,
        erc20TokenPeriodic: 0,
        custom: {
          count: 0,
          data: [],
        },
      },
      '0xa': {
        nativeTokenStream: 0,
        nativeTokenPeriodic: 0,
        erc20TokenStream: 1,
        erc20TokenPeriodic: 0,
        custom: {
          count: 0,
          data: [],
        },
      },
    };

    const result = mockGatorPermissionsStorageEntriesFactory(config);

    expect(result).toHaveLength(3);

    // Check that each chain ID is represented
    const chainIds = result.map((entry) => entry.permissionResponse.chainId);
    expect(chainIds).toContain('0x1');
    expect(chainIds).toContain('0x5');
    expect(chainIds).toContain('0xa');

    // Check that each entry has the correct permission type for its chain
    const chain0x1Entry = result.find(
      (entry) => entry.permissionResponse.chainId === '0x1',
    );
    expect(chain0x1Entry?.permissionResponse.permission.type).toBe(
      'native-token-stream',
    );

    const chain0x5Entry = result.find(
      (entry) => entry.permissionResponse.chainId === '0x5',
    );
    expect(chain0x5Entry?.permissionResponse.permission.type).toBe(
      'native-token-periodic',
    );

    const chain0xaEntry = result.find(
      (entry) => entry.permissionResponse.chainId === '0xa',
    );
    expect(chain0xaEntry?.permissionResponse.permission.type).toBe(
      'erc20-token-stream',
    );
  });

  it('should handle custom permissions with different data', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 0,
        nativeTokenPeriodic: 0,
        erc20TokenStream: 0,
        erc20TokenPeriodic: 0,
        custom: {
          count: 3,
          data: [
            { field1: 'value1', number1: 123 },
            { field2: 'value2', boolean1: true },
            { field3: 'value3', object1: { nested: 'value' } },
          ],
        },
      },
    };

    const result = mockGatorPermissionsStorageEntriesFactory(config);

    expect(result).toHaveLength(3);

    // Check that all entries are custom permissions
    const permissionTypes = result.map(
      (entry) => entry.permissionResponse.permission.type,
    );
    expect(permissionTypes.every((type) => type === 'custom')).toBe(true);

    // Check that each entry has the correct custom data
    const customData = result.map(
      (entry) => entry.permissionResponse.permission.data,
    );
    expect(customData[0]).toMatchObject({
      justification:
        'This is a very important request for streaming allowance for some very important thing',
      field1: 'value1',
      number1: 123,
    });
    expect(customData[1]).toMatchObject({
      justification:
        'This is a very important request for streaming allowance for some very important thing',
      field2: 'value2',
      boolean1: true,
    });
    expect(customData[2]).toMatchObject({
      justification:
        'This is a very important request for streaming allowance for some very important thing',
      field3: 'value3',
      object1: { nested: 'value' },
    });
  });

  it('should throw error when custom count and data length mismatch', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 0,
        nativeTokenPeriodic: 0,
        erc20TokenStream: 0,
        erc20TokenPeriodic: 0,
        custom: {
          count: 2,
          data: [{ field1: 'value1' }],
        },
      },
    };

    expect(() => mockGatorPermissionsStorageEntriesFactory(config)).toThrow(
      'Custom permission count and data length mismatch',
    );
  });

  it('should handle complex configuration with multiple chain IDs and permission types', () => {
    const config: MockGatorPermissionsStorageEntriesConfig = {
      '0x1': {
        nativeTokenStream: 2,
        nativeTokenPeriodic: 1,
        erc20TokenStream: 1,
        erc20TokenPeriodic: 2,
        custom: {
          count: 1,
          data: [{ complexField: { nested: { deep: 'value' } } }],
        },
      },
      '0x5': {
        nativeTokenStream: 1,
        nativeTokenPeriodic: 3,
        erc20TokenStream: 2,
        erc20TokenPeriodic: 1,
        custom: {
          count: 2,
          data: [{ arrayField: [1, 2, 3] }, { nullField: null }],
        },
      },
    };

    const result = mockGatorPermissionsStorageEntriesFactory(config);

    // Total expected entries
    expect(result).toHaveLength(16);

    // Verify chain IDs are correct
    const chainIds = result.map((entry) => entry.permissionResponse.chainId);
    const chain0x1Count = chainIds.filter((id) => id === '0x1').length;
    const chain0x5Count = chainIds.filter((id) => id === '0x5').length;
    expect(chain0x1Count).toBe(7);
    expect(chain0x5Count).toBe(9);

    // Verify permission types are distributed correctly
    const permissionTypes = result.map(
      (entry) => entry.permissionResponse.permission.type,
    );
    const nativeTokenStreamCount = permissionTypes.filter(
      (type) => type === 'native-token-stream',
    ).length;
    const nativeTokenPeriodicCount = permissionTypes.filter(
      (type) => type === 'native-token-periodic',
    ).length;
    const erc20TokenStreamCount = permissionTypes.filter(
      (type) => type === 'erc20-token-stream',
    ).length;
    const erc20TokenPeriodicCount = permissionTypes.filter(
      (type) => type === 'erc20-token-periodic',
    ).length;
    const customCount = permissionTypes.filter(
      (type) => type === 'custom',
    ).length;

    expect(nativeTokenStreamCount).toBe(3);
    expect(nativeTokenPeriodicCount).toBe(4);
    expect(erc20TokenStreamCount).toBe(3);
    expect(erc20TokenPeriodicCount).toBe(3);
    expect(customCount).toBe(3);
  });
});
