import { SentinelChainNotSupportedError } from '@metamask/sentinel-api-service';
import type { SentinelSimulationResponse } from '@metamask/sentinel-api-service';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import {
  build7702BatchSimulation,
  buildCallsSimulation,
  buildDelegationSimulation,
  simulateQuoteTransactions,
} from './simulation.js';
import type { SimulationRequest } from './simulation.js';

const CHAIN_ID_MOCK = '0x38' as Hex;
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const DELEGATOR_MOCK = '0x3333333333333333333333333333333333333333' as Hex;

const CHAIN_UNSUPPORTED_ERROR = new SentinelChainNotSupportedError(
  CHAIN_ID_MOCK,
);

describe('simulateQuoteTransactions', () => {
  let messengerMock: ReturnType<typeof getMessengerMock>;

  function buildRequest(
    overrides?: Partial<SimulationRequest>,
  ): SimulationRequest {
    return {
      chainId: CHAIN_ID_MOCK,
      messenger: messengerMock.messenger,
      transactions: [{ from: FROM_MOCK, to: TOKEN_ADDRESS_MOCK }],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    messengerMock = getMessengerMock();
    messengerMock.simulateTransactionsMock.mockResolvedValue({
      transactions: [{}],
    });
  });

  describe('Sentinel throws', () => {
    it('skips validation when Sentinel throws chain-unsupported error', async () => {
      messengerMock.simulateTransactionsMock.mockRejectedValue(
        CHAIN_UNSUPPORTED_ERROR,
      );

      expect(await simulateQuoteTransactions(buildRequest())).toBeUndefined();
    });

    it('throws TransactionPaySimulationError when Sentinel throws a generic error', async () => {
      messengerMock.simulateTransactionsMock.mockRejectedValue(
        new Error('network timeout'),
      );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'network timeout',
      });
    });

    it('throws TransactionPaySimulationError when Sentinel throws a non-chain-unsupported error', async () => {
      messengerMock.simulateTransactionsMock.mockRejectedValue(
        new Error('Internal server error'),
      );

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'Internal server error',
      });
    });

    it('throws with String() when the thrown value is not an Error instance', async () => {
      messengerMock.simulateTransactionsMock.mockRejectedValue({
        code: 999,
        message: 'x',
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: '[object Object]',
      });
    });
  });

  describe('Sentinel response errors', () => {
    it('throws when Sentinel returns a direct error on a response transaction', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{ error: 'tx route error' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'tx route error',
      });
    });

    it('throws when Sentinel returns an error on the second response transaction', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{}, { error: 'tx2 route error' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        message: 'tx2 route error',
      });
    });

    it('throws a custom error with the return data when execution reverted with return data', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{ error: 'execution reverted', return: '0xdeadbeef' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'Custom Error - 0xdeadbeef',
      });
    });

    it('throws an unknown reverted error when execution reverted with empty return data', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{ error: 'execution reverted', return: '0x' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'Reverted - Unknown Error',
      });
    });

    it('throws an unknown reverted error when execution reverted with no return data', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{ error: 'execution reverted' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'Reverted - Unknown Error',
      });
    });

    it('throws the original error unchanged for non-reverted errors even with return data', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{ error: 'tx route error', return: '0xdeadbeef' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'tx route error',
      });
    });

    it('strips the execution reverted prefix and surfaces the reason when a message follows', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [{ error: 'execution reverted: insufficient allowance' }],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'insufficient allowance',
      });
    });

    it('prefers the reason over return data when execution reverted has both', async () => {
      messengerMock.simulateTransactionsMock.mockResolvedValue({
        transactions: [
          {
            error: 'execution reverted: insufficient allowance',
            return: '0xdeadbeef',
          },
        ],
      });

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        name: 'TransactionPaySimulationError',
        message: 'insufficient allowance',
      });
    });
  });

  describe('Sentinel call', () => {
    it('calls Sentinel without overrides', async () => {
      await simulateQuoteTransactions(buildRequest());

      expect(messengerMock.simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.not.objectContaining({ overrides: expect.anything() }),
      );
    });

    it('passes transactions and withLogs to Sentinel', async () => {
      const transactions = [{ from: FROM_MOCK, to: TOKEN_ADDRESS_MOCK }];

      await simulateQuoteTransactions(buildRequest({ transactions }));

      expect(messengerMock.simulateTransactionsMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
        expect.objectContaining({
          transactions,
          withLogs: true,
        }),
      );
    });
  });
});

describe('buildDelegationSimulation', () => {
  it('builds a single transaction with authorizations from the sender', () => {
    expect(
      buildDelegationSimulation({
        authorizationList: [{ address: DELEGATOR_MOCK }],
        data: '0x1234',
        from: FROM_MOCK,
        to: TOKEN_ADDRESS_MOCK,
        value: '0x0',
      }),
    ).toStrictEqual({
      transactions: [
        {
          authorizationList: [{ address: DELEGATOR_MOCK, from: FROM_MOCK }],
          data: '0x1234',
          from: FROM_MOCK,
          to: TOKEN_ADDRESS_MOCK,
          value: '0x0',
        },
      ],
    });
  });

  it('omits the authorization list when empty', () => {
    expect(
      buildDelegationSimulation({
        authorizationList: [],
        data: '0x1234',
        from: FROM_MOCK,
        to: TOKEN_ADDRESS_MOCK,
        value: '0x0',
      }).transactions[0],
    ).not.toHaveProperty('authorizationList');
  });
});

describe('build7702BatchSimulation', () => {
  const CALLS_MOCK = [
    {
      data: '0x1234' as Hex,
      from: FROM_MOCK,
      to: TOKEN_ADDRESS_MOCK,
      value: '0x0' as Hex,
    },
    {
      data: '0x5678' as Hex,
      from: FROM_MOCK,
      to: TOKEN_ADDRESS_MOCK,
      value: '0x1' as Hex,
    },
  ];

  it('builds a batch on the sender account with an authorization and gas', () => {
    const { transactions } = build7702BatchSimulation({
      authorizationAddress: DELEGATOR_MOCK,
      calls: CALLS_MOCK,
      from: FROM_MOCK,
      gas: 21000,
    });

    expect(transactions).toStrictEqual([
      {
        authorizationList: [{ address: DELEGATOR_MOCK, from: FROM_MOCK }],
        data: expect.stringMatching(/^0x[0-9a-f]+$/u),
        from: FROM_MOCK,
        gas: '0x5208',
        to: FROM_MOCK,
        value: '0x0',
      },
    ]);
  });

  it.each([undefined, 0])(
    'omits the authorization and gas when not provided (gas: %s)',
    (gas) => {
      const [transaction] = build7702BatchSimulation({
        calls: CALLS_MOCK,
        from: FROM_MOCK,
        gas,
      }).transactions;

      expect(transaction).not.toHaveProperty('authorizationList');
      expect(transaction).not.toHaveProperty('gas');
    },
  );
});

describe('buildCallsSimulation', () => {
  it('builds one transaction per call', () => {
    expect(
      buildCallsSimulation([
        {
          data: '0x1234',
          from: FROM_MOCK,
          gas: '0x5208',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x1',
          to: TOKEN_ADDRESS_MOCK,
          value: '0x0',
        },
      ]),
    ).toStrictEqual({
      transactions: [
        {
          data: '0x1234',
          from: FROM_MOCK,
          gas: '0x5208',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x1',
          to: TOKEN_ADDRESS_MOCK,
          value: '0x0',
        },
      ],
    });
  });

  it.each([undefined, '0x0'])('omits gas when it is %s', (gas) => {
    const [transaction] = buildCallsSimulation([
      { from: FROM_MOCK, gas, to: TOKEN_ADDRESS_MOCK, value: '0x0' },
    ]).transactions;

    expect(transaction).not.toHaveProperty('gas');
  });
});
