import { SentinelChainNotSupportedError } from '@metamask/sentinel-api-service';
import type { SentinelSimulationResponse } from '@metamask/sentinel-api-service';
import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock.js';
import { simulateQuoteTransactions } from './simulation.js';
import type { SimulationRequest } from './simulation.js';

const CHAIN_ID_MOCK = '0x38' as Hex;
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN_ADDRESS_MOCK = '0x2222222222222222222222222222222222222222' as Hex;

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
    jest.resetAllMocks();
    messengerMock = getMessengerMock();
    messengerMock.simulateTransactionsMock.mockResolvedValue({
      transactions: [{}],
    } as unknown as SentinelSimulationResponse);
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
      } as unknown as SentinelSimulationResponse);

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
      } as unknown as SentinelSimulationResponse);

      await expect(
        simulateQuoteTransactions(buildRequest()),
      ).rejects.toMatchObject({
        message: 'tx2 route error',
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
