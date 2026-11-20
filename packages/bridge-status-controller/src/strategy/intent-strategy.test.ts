/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { TransactionStatus } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMockInternalAccount } from '../__fixtures__/test-utils.js';
import { BridgeClientId } from '../types.js';
import type { BridgeStatusControllerMessenger } from '../types.js';
import * as intentApi from '../utils/intent-api.js';
import { IntentOrderStatus } from '../utils/validators.js';
import { submitIntentHandler } from './intent-strategy.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

const ORDER_UID = 'order-uid-1';
const HISTORY_KEY = 'withdraw-history-key';
const SYNTHETIC_TX_ID = 'intent-synthetic-id';

const intentQuoteResponse = () => ({
  quote: {
    requestId: 'req-1',
    srcChainId: 1,
    destChainId: 1,
    srcTokenAmount: '1000',
    destTokenAmount: '990',
    bridges: ['cowswap'],
    bridgeId: 'cowswap',
    minDestTokenAmount: '900',
    srcAsset: {
      symbol: 'ETH',
      chainId: 1,
      address: '0x0000000000000000000000000000000000000000',
      assetId: 'eip155:1/slip44:60',
      name: 'ETH',
      decimals: 18,
    },
    destAsset: {
      symbol: 'ETH',
      chainId: 1,
      address: '0x0000000000000000000000000000000000000000',
      assetId: 'eip155:1/slip44:60',
      name: 'ETH',
      decimals: 18,
    },
    feeData: {
      txFee: {
        amount: '1',
        asset: { address: '0x0', decimals: 18, symbol: 'ETH' },
      },
      metabridge: {
        amount: '0',
        asset: { address: '0x0', decimals: 18, symbol: 'ETH' },
      },
    },
    intent: {
      protocol: 'cowswap',
      order: {
        sellToken: '0x0000000000000000000000000000000000000001',
        buyToken: '0x0000000000000000000000000000000000000002',
        validTo: 1717027200,
        appData: 'some-app-data',
        appDataHash: '0xabcd',
        feeAmount: '100',
        kind: 'sell' as const,
        partiallyFillable: false,
        sellAmount: '1000',
      },
      settlementContract: '0x9008D19f58AAbd9eD0D60971565AA8510560ab41',
      typedData: {
        types: {},
        domain: {},
        primaryType: 'Order',
        message: {},
      },
    },
    steps: [],
  },
  estimatedProcessingTimeInSeconds: 15,
  trade: {
    chainId: 1,
    from: '0xaccount1',
    to: '0x0000000000000000000000000000000000000001',
    data: '0x',
    value: '0x0',
    gasLimit: 21000,
  },
  sentAmount: { amount: '1', usd: '1' },
  gasFee: { effective: { amount: '0', usd: '0' } },
  toTokenAmount: { usd: '1' },
});

const collectSteps = async (args: SubmitStrategyParams) => {
  const steps: SubmitStepResult[] = [];
  for await (const step of submitIntentHandler(args)) {
    steps.push(step);
  }
  return steps;
};

const makeArgs = (
  overrides: Partial<SubmitStrategyParams> = {},
): SubmitStrategyParams => {
  const messenger = {
    call: vi.fn((action: string) => {
      switch (action) {
        case 'KeyringController:signTypedMessage':
          return '0xsignature';
        case 'AuthenticationController:getBearerToken':
          return 'jwt';
        case 'NetworkController:findNetworkClientIdByChainId':
          return 'mainnet';
        case 'TransactionController:addTransaction':
          return {
            transactionMeta: {
              id: SYNTHETIC_TX_ID,
              status: TransactionStatus.submitted,
              chainId: '0x1',
              networkClientId: 'mainnet',
              time: 1,
              txParams: { from: '0xaccount1' },
            },
            result: Promise.resolve('0xhash'),
          };
        default:
          return null;
      }
    }),
  } as unknown as BridgeStatusControllerMessenger;

  return {
    messenger,
    traceFn: ((_request, fn) => fn?.()) as SubmitStrategyParams['traceFn'],
    fetchFn: vi.fn(),
    addTransactionBatchFn: vi.fn(),
    batchSellTrades: null,
    isBridgeTx: false,
    isDelegatedAccount: false,
    isStxEnabled: false,
    requireApproval: false,
    selectedAccount: getMockInternalAccount(),
    clientId: BridgeClientId.EXTENSION,
    bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
    quoteResponses: [intentQuoteResponse() as any],
    ...overrides,
  };
};

describe('submitIntentHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(intentApi, 'postSubmitOrder').mockResolvedValue({
      id: ORDER_UID,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });
  });

  it('updates and polls the existing history key after a withdraw, not orderUid', async () => {
    const steps = await collectSteps(
      makeArgs({ historyKey: HISTORY_KEY, batchId: '0xbatch' }),
    );

    const update = steps.find(
      (step) => step.type === SubmitStep.UpdateHistoryItem,
    );
    const poll = steps.find((step) => step.type === SubmitStep.StartPolling);
    const add = steps.find((step) => step.type === SubmitStep.AddHistoryItem);

    expect(add).toBeUndefined();
    expect(update?.payload).toStrictEqual(
      expect.objectContaining({
        historyKey: HISTORY_KEY,
        historyItemOverrides: expect.objectContaining({
          orderId: ORDER_UID,
        }),
      }),
    );
    expect(poll?.payload).toStrictEqual({ historyKey: HISTORY_KEY });
  });

  it('adds and polls a new history item at orderUid when no prior history key exists', async () => {
    const steps = await collectSteps(makeArgs());

    const add = steps.find((step) => step.type === SubmitStep.AddHistoryItem);
    const poll = steps.find((step) => step.type === SubmitStep.StartPolling);
    const update = steps.find(
      (step) => step.type === SubmitStep.UpdateHistoryItem,
    );

    expect(update).toBeUndefined();
    expect(add?.payload).toStrictEqual(
      expect.objectContaining({
        historyKey: ORDER_UID,
        orderId: ORDER_UID,
        bridgeTxMeta: expect.objectContaining({
          id: SYNTHETIC_TX_ID,
        }),
      }),
    );
    expect(poll?.payload).toStrictEqual({ historyKey: ORDER_UID });
  });
});
