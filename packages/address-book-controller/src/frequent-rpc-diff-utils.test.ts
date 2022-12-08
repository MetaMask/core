import {
  buildFrequentRpcDiff,
  isFrequentRpcChange,
} from './frequent-rpc-diff-utils';

describe('buildFrequentRpcDiff', () => {
  it('returns an object whose originalChainId is the chain ID of the previous RPC entry corresponding to the current entry, as a string', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
        chainId: 2,
      },
      previousFrequentRpcList: [
        {
          rpcUrl: 'http://foo.com',
          chainId: 1,
        },
      ],
      currentNetworkIdResponse: {
        result: '12345',
      },
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.originalChainId).toBe('1');
  });

  it('returns an object whose originalChainId is the current network ID if the current RPC entry has a corresponding previous entry with no chain ID', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
        chainId: 1,
      },
      previousFrequentRpcList: [
        {
          rpcUrl: 'http://foo.com',
        },
      ],
      currentNetworkIdResponse: {
        result: '12345',
      },
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.originalChainId).toBe('12345');
  });

  it('returns an object whose originalChainId is undefined when the current RPC entry has a corresponding previous entry with no chain ID and the current network ID cannot be determined', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
        chainId: 1,
      },
      previousFrequentRpcList: [
        {
          rpcUrl: 'http://foo.com',
        },
      ],
      currentNetworkIdResponse: {
        error: 'some error',
      },
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.originalChainId).toBeUndefined();
  });

  it('returns an object whose originalChainId is undefined when the current RPC entry has no corresponding previous entry and the current network ID cannot be determined', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
      },
      previousFrequentRpcList: [],
      currentNetworkIdResponse: {
        error: 'some error',
      },
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.originalChainId).toBeUndefined();
  });

  it('returns an object whose newChainId is the chain ID of the given RPC entry, as a string', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
        chainId: 1,
      },
      previousFrequentRpcList: [],
      currentNetworkIdResponse: buildFakeSuccessfulNetworkResponse(),
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.newChainId).toBe('1');
  });

  it('returns an object whose newChainId is undefined if the given RPC entry does not have a chain ID', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
      },
      previousFrequentRpcList: [],
      currentNetworkIdResponse: buildFakeSuccessfulNetworkResponse(),
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.newChainId).toBeUndefined();
  });

  it('returns an object whose shouldRemoveAddressBookForOriginalChainId is true if the chain ID of the previous RPC entry is not a default chain ID, and no previous entry existed that had a different RPC URL as the current entry but shared the same chain ID', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
      },
      previousFrequentRpcList: [
        {
          rpcUrl: 'http://foo.com',
          chainId: 100,
        },
      ],
      currentNetworkIdResponse: buildFakeSuccessfulNetworkResponse(),
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.shouldRemoveAddressBookForOriginalChainId).toBe(
      true,
    );
  });

  [1, 5, 1337, 11155111].forEach((defaultChainId) => {
    it(`returns an object whose shouldRemoveAddressBookForOriginalChainId is false if the chain ID of the previous RPC is ${defaultChainId}`, () => {
      const frequentRpcDiff = buildFrequentRpcDiff({
        frequentRpc: {
          rpcUrl: 'http://foo.com',
        },
        previousFrequentRpcList: [
          {
            rpcUrl: 'http://foo.com',
            chainId: defaultChainId,
          },
        ],
        currentNetworkIdResponse: buildFakeSuccessfulNetworkResponse(),
        log: buildFakeLog(),
      });

      expect(frequentRpcDiff.shouldRemoveAddressBookForOriginalChainId).toBe(
        false,
      );
    });
  });

  it('returns an object whose shouldRemoveAddressBookForOriginalChainId is false if there was previously an RPC entry that had a different RPC URL as the current entry but shared the same chain ID', () => {
    const frequentRpcDiff = buildFrequentRpcDiff({
      frequentRpc: {
        rpcUrl: 'http://foo.com',
        chainId: 200,
      },
      previousFrequentRpcList: [
        {
          rpcUrl: 'http://foo.com',
          chainId: 100,
        },
        {
          rpcUrl: 'http://bar.com',
          chainId: 100,
        },
      ],
      currentNetworkIdResponse: buildFakeSuccessfulNetworkResponse(),
      log: buildFakeLog(),
    });

    expect(frequentRpcDiff.shouldRemoveAddressBookForOriginalChainId).toBe(
      false,
    );
  });
});

describe('isFrequentRpcChange', () => {
  it('returns true if the given object has both an originalChainId and a newChainId, and they are different', () => {
    const frequentRpcDiff = {
      originalChainId: '1',
      newChainId: '2',
      shouldRemoveAddressBookForOriginalChainId: true,
    };

    expect(isFrequentRpcChange(frequentRpcDiff)).toBe(true);
  });

  it('returns false if the given object has an originalChainId of undefined', () => {
    const frequentRpcDiff = {
      originalChainId: undefined,
      newChainId: '2',
      shouldRemoveAddressBookForOriginalChainId: true,
    };

    expect(isFrequentRpcChange(frequentRpcDiff)).toBe(false);
  });

  it('returns false if the given object has a newChainId of undefined', () => {
    const frequentRpcDiff = {
      originalChainId: '1',
      newChainId: undefined,
      shouldRemoveAddressBookForOriginalChainId: true,
    };

    expect(isFrequentRpcChange(frequentRpcDiff)).toBe(false);
  });

  it('returns false if neither originalChainId nor newChainId is undefined, but they are the same', () => {
    const frequentRpcDiff = {
      originalChainId: '1',
      newChainId: '1',
      shouldRemoveAddressBookForOriginalChainId: true,
    };

    expect(isFrequentRpcChange(frequentRpcDiff)).toBe(false);
  });
});

/**
 * Builds an object that represents the result of retrieving the ID of the
 * current network.
 *
 * @returns The NetworkResponse object.
 */
function buildFakeSuccessfulNetworkResponse() {
  return { result: '99999' };
}

/**
 * Builds a dummy log function that can be passed to `buildFrequentRpcDiff`.
 *
 * @returns The function.
 */
function buildFakeLog() {
  return () => {
    // do nothing
  };
}
