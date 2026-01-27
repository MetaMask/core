import { StatusTypes } from '@metamask/bridge-controller';

import { BasePoller, PollerContext, PollerFetchResult } from './polling.base';
import { BridgeTxPoller } from './polling.bridge';
import { IntentTxPoller } from './polling.intent';
import { BridgeClientId } from '../../types';
import type { BridgeHistoryItem } from '../../types';

const createContext = (): {
  state: { txHistory: Record<string, BridgeHistoryItem> };
  context: PollerContext;
} => {
  const state = {
    txHistory: {} as Record<string, BridgeHistoryItem>,
  };

  const context: PollerContext = {
    clientId: BridgeClientId.EXTENSION,
    fetchFn: jest.fn(),
    customBridgeApiBaseUrl: 'http://localhost',
    update: (updater) => {
      updater(state as never);
    },
    getState: () => state as never,
    stopPollingByPollingToken: jest.fn(),
    getPollingToken: jest.fn(),
    clearPollingToken: jest.fn(),
    handleFetchFailure: jest.fn(),
    trackEvent: jest.fn() as unknown as PollerContext['trackEvent'],
    publishDestinationCompleted: jest.fn(),
    getTransactionById: jest.fn(),
    updateTransactionFn: jest.fn(),
    getSrcTxHash: jest.fn(),
    updateSrcTxHash: jest.fn(),
  };

  return { state, context };
};

class MinimalPoller extends BasePoller {
  protected async fetch(_args: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
  }): Promise<PollerFetchResult> {
    return {
      historyItemPatch: {
        status: {
          status: StatusTypes.COMPLETE,
          srcChain: { chainId: 1, txHash: '0xhash' },
        },
      },
      isFinal: true,
    };
  }

  protected afterUpdate(): void {
    return undefined;
  }

  protected onFinalStatus(): void {
    return undefined;
  }

  protected onError(): void {
    return undefined;
  }
}

class ThrowingPoller extends BasePoller {
  protected async fetch(): Promise<never> {
    throw new Error('boom');
  }

  protected afterUpdate(): void {
    return undefined;
  }

  protected onFinalStatus(): void {
    return undefined;
  }

  protected onError(): void {
    return undefined;
  }
}

describe('BridgeStatusController pollers', () => {
  it('basePoller.run: returns early when history item is missing', async () => {
    const { context } = createContext();
    const poller = new MinimalPoller(context);

    const fetchSpy = jest.spyOn(
      poller as unknown as { fetch: () => Promise<unknown> },
      'fetch',
    );
    await poller.run('missing-tx');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('basePoller.run: returns early when polling token is missing for final status', async () => {
    const { context, state } = createContext();
    state.txHistory.tx1 = {
      txMetaId: 'tx1',
      quote: {
        srcChainId: 1,
        destChainId: 1,
        destAsset: { assetId: 'eip155:1/slip44:60' },
      },
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    } as unknown as BridgeHistoryItem;

    (context.getPollingToken as jest.Mock).mockReturnValue(undefined);

    const poller = new MinimalPoller(context);
    await poller.run('tx1');

    expect(context.stopPollingByPollingToken).not.toHaveBeenCalled();
  });

  it('basePoller.run: calls subclass onFinalStatus when final and token exists', async () => {
    const { context, state } = createContext();
    state.txHistory.tx2 = {
      txMetaId: 'tx2',
      quote: {
        srcChainId: 1,
        destChainId: 1,
        destAsset: { assetId: 'eip155:1/slip44:60' },
      },
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    } as unknown as BridgeHistoryItem;

    (context.getPollingToken as jest.Mock).mockReturnValue('token-1');

    const poller = new MinimalPoller(context);
    const onFinalStatusSpy = jest.spyOn(
      poller as unknown as { onFinalStatus: () => void },
      'onFinalStatus',
    );
    await poller.run('tx2');

    expect(context.stopPollingByPollingToken).toHaveBeenCalledWith('token-1');
    expect(onFinalStatusSpy).toHaveBeenCalled();
    onFinalStatusSpy.mockRestore();
  });

  it('basePoller.run: uses default onError when fetch throws', async () => {
    const { context, state } = createContext();
    state.txHistory.tx3 = {
      txMetaId: 'tx3',
      quote: {
        srcChainId: 1,
        destChainId: 1,
        destAsset: { assetId: 'eip155:1/slip44:60' },
      },
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    } as unknown as BridgeHistoryItem;

    const poller = new ThrowingPoller(context);
    const onErrorSpy = jest.spyOn(
      poller as unknown as { onError: () => void },
      'onError',
    );
    await poller.run('tx3');

    expect(onErrorSpy).toHaveBeenCalled();
    expect(context.handleFetchFailure).toHaveBeenCalledWith('tx3');
    onErrorSpy.mockRestore();
  });

  it('basePoller: uses subclass hooks for afterUpdate and onFinalStatus', async () => {
    const { context, state } = createContext();
    state.txHistory.tx4 = {
      txMetaId: 'tx4',
      quote: {
        srcChainId: 1,
        destChainId: 1,
        destAsset: { assetId: 'eip155:1/slip44:60' },
      },
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    } as unknown as BridgeHistoryItem;

    (context.getPollingToken as jest.Mock).mockReturnValue('token-2');

    const afterUpdateSpy = jest.spyOn(
      BridgeTxPoller.prototype as unknown as {
        afterUpdate: () => void;
      },
      'afterUpdate',
    );
    const onFinalStatusSpy = jest.spyOn(
      BridgeTxPoller.prototype as unknown as {
        onFinalStatus: () => void;
      },
      'onFinalStatus',
    );

    class FinalPoller extends BridgeTxPoller {
      protected async fetch(): Promise<PollerFetchResult> {
        return {
          historyItemPatch: {
            status: {
              status: StatusTypes.COMPLETE,
              srcChain: { chainId: 1, txHash: '0xhash' },
            },
          },
          isFinal: true,
        };
      }
    }

    const poller = new FinalPoller(context);
    await poller.run('tx4');

    expect(afterUpdateSpy).toHaveBeenCalled();
    expect(onFinalStatusSpy).toHaveBeenCalled();
    afterUpdateSpy.mockRestore();
    onFinalStatusSpy.mockRestore();
  });

  it('intentTxPoller.afterUpdate: returns early when original tx id is intent:*', async () => {
    const { context } = createContext();
    const poller = new IntentTxPoller(context) as unknown as {
      afterUpdate: (args: {
        bridgeTxMetaId: string;
        historyItem: BridgeHistoryItem;
        result: PollerFetchResult;
      }) => void | Promise<void>;
    };

    await poller.afterUpdate({
      bridgeTxMetaId: 'intent:1',
      historyItem: {
        txMetaId: 'intent:1',
        originalTransactionId: 'intent:original',
        quote: {
          srcChainId: 1,
          destChainId: 1,
          destAsset: { assetId: 'eip155:1/slip44:60' },
        },
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '' },
        },
      } as unknown as BridgeHistoryItem,
      result: {
        historyItemPatch: {
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: '' },
          },
        },
        isFinal: false,
      },
    });

    expect(context.updateTransactionFn).not.toHaveBeenCalled();
  });

  it('intentTxPoller.afterUpdate: catches transaction update errors', async () => {
    const { context } = createContext();
    (context.getTransactionById as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const poller = new IntentTxPoller(context) as unknown as {
      afterUpdate: (args: {
        bridgeTxMetaId: string;
        historyItem: BridgeHistoryItem;
        result: PollerFetchResult;
      }) => void | Promise<void>;
    };
    await poller.afterUpdate({
      bridgeTxMetaId: 'intent:2',
      historyItem: {
        txMetaId: 'intent:2',
        originalTransactionId: 'tx-original',
        quote: {
          srcChainId: 1,
          destChainId: 1,
          destAsset: { assetId: 'eip155:1/slip44:60' },
        },
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '' },
        },
      } as unknown as BridgeHistoryItem,
      result: {
        historyItemPatch: {
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: '' },
          },
        },
        isFinal: false,
      },
    });

    expect(consoleSpy).toHaveBeenCalled();
  });
});
