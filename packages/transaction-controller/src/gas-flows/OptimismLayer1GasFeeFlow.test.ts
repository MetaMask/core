import * as ControllerUtils from '@metamask/controller-utils';
import { hexToNumber, type Hex } from '@metamask/utils';

import { OptimismLayer1GasFeeFlow } from './OptimismLayer1GasFeeFlow';
import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';

jest.mock('@metamask/controller-utils', () => {
  const actual = jest.requireActual('@metamask/controller-utils');
  return { ...actual, handleFetch: jest.fn() };
});

type SupportedNetworksResponseMock = {
  fullSupport: number[];
  partialSupport: { optimism: number[] };
};

/**
 * Creates a minimal `TransactionMeta` object for testing with the provided chain ID.
 *
 * @param chainId - The hex-encoded chain ID to set on the transaction.
 * @returns A `TransactionMeta` stub suitable for tests.
 */
function createTransaction(chainId: string): TransactionMeta {
  return {
    id: '1',
    chainId: chainId as Hex,
    networkClientId: 'testNetworkClientId',
    status: TransactionStatus.unapproved,
    time: 0,
    txParams: {
      from: '0x123',
      gas: '0x1234',
    },
  };
}

describe('OptimismLayer1GasFeeFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const messenger = {} as TransactionControllerMessenger;

  describe('matchesTransaction', () => {
    let handleFetchMock: jest.MockedFunction<
      (url: string, init?: unknown) => Promise<SupportedNetworksResponseMock>
    >;

    beforeEach(() => {
      handleFetchMock = ControllerUtils.handleFetch as jest.MockedFunction<
        (url: string, init?: unknown) => Promise<SupportedNetworksResponseMock>
      >;
      handleFetchMock.mockReset();
    });

    it.each([
      ['Optimism mainnet', CHAIN_IDS.OPTIMISM],
      ['Optimism testnet', CHAIN_IDS.OPTIMISM_TESTNET],
    ])(
      'uses the fallback list when remote fetch fails for %s',
      async (_title: string, chainId: string) => {
        handleFetchMock.mockRejectedValue(new Error('ignore'));
        const flow = new OptimismLayer1GasFeeFlow();
        const transactionMeta = createTransaction(chainId);

        expect(
          await flow.matchesTransaction({
            transactionMeta,
            messenger,
          }),
        ).toBe(true);
      },
    );

    it('returns true when the remote list contains the chain', async () => {
      handleFetchMock.mockResolvedValue({
        fullSupport: [],
        partialSupport: { optimism: [hexToNumber(CHAIN_IDS.OPTIMISM)] },
      });
      const flow = new OptimismLayer1GasFeeFlow();
      const transactionMeta = createTransaction(CHAIN_IDS.OPTIMISM);

      expect(
        await flow.matchesTransaction({
          transactionMeta,
          messenger,
        }),
      ).toBe(true);
    });

    it('falls back to static list when remote list omits the chain', async () => {
      handleFetchMock.mockResolvedValue({
        fullSupport: [],
        partialSupport: { optimism: [] },
      });
      const flow = new OptimismLayer1GasFeeFlow();
      const transactionMeta = createTransaction(CHAIN_IDS.BASE);

      expect(
        await flow.matchesTransaction({
          transactionMeta,
          messenger,
        }),
      ).toBe(true);
    });

    it('returns false when neither remote nor fallback include the chain', async () => {
      handleFetchMock.mockResolvedValue({
        fullSupport: [],
        partialSupport: { optimism: [] },
      });
      const flow = new OptimismLayer1GasFeeFlow();
      const transactionMeta = createTransaction('0x9999');

      expect(
        await flow.matchesTransaction({
          transactionMeta,
          messenger,
        }),
      ).toBe(false);
    });

    it('uses the fallback list when the remote payload is missing', async () => {
      handleFetchMock.mockResolvedValue(
        undefined as unknown as SupportedNetworksResponseMock,
      );

      const flow = new OptimismLayer1GasFeeFlow();
      const transactionMeta = createTransaction(CHAIN_IDS.ZORA);

      expect(
        await flow.matchesTransaction({
          transactionMeta,
          messenger,
        }),
      ).toBe(true);
    });
  });
});
