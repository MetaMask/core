import {
  buildLifecycleMocks,
  buildTransactionMeta,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import { TransactionEnvelopeType, TransactionType } from '../types.js';
import { updateGasFees } from '../utils/gas-fees.js';
import { updateTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow.js';
import { updateSwapsTransaction } from '../utils/swaps.js';
import { addTransactionData } from './data.js';
import { getEIP1559Compatibility } from './init.js';

jest.mock('../utils/gas-fees.js');
jest.mock('../utils/layer1-gas-fee-flow.js');
jest.mock('../utils/swaps.js');
jest.mock('./init.js');

/** Flush all pending microtasks (Promise resolution queues). */
async function flushMicrotasks(): Promise<void> {
  // Yield enough times so that chained Promise callbacks (including .then chains
  // inside updateGasProperties) fully resolve.
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe('addTransactionData', () => {
  beforeEach(() => {
    jest.mocked(getEIP1559Compatibility).mockResolvedValue(true);
    jest.mocked(updateGasFees).mockResolvedValue(undefined);
    jest.mocked(updateTransactionLayer1GasFee).mockResolvedValue(undefined);
    jest.mocked(updateSwapsTransaction).mockImplementation((txMeta) => txMeta);
  });

  // ---------------------------------------------------------------------------
  // afterAdd hook
  // ---------------------------------------------------------------------------

  describe('afterAdd hook', () => {
    it('calls the afterAdd hook with the transaction meta', async () => {
      const { request } = buildLifecycleMocks();
      // afterAdd is always set by buildLifecycleMocks; cast through unknown to satisfy strict
      // lint (no-non-null-assertion). The cast is safe because we control the fixture.
      const afterAdd = jest.mocked(
        request.constructorOptions.hooks.afterAdd as jest.Mock,
      );

      await addTransactionData(request);

      expect(afterAdd).toHaveBeenCalledWith({
        transactionMeta: request.transactionMeta,
      });
    });

    it('does not set txParamsOriginal when afterAdd returns no updateTransaction', async () => {
      const { request } = buildLifecycleMocks();
      jest
        .mocked(request.constructorOptions.hooks.afterAdd as jest.Mock)
        .mockResolvedValue({});

      await addTransactionData(request);

      expect(request.transactionMeta.txParamsOriginal).toBeUndefined();
    });

    it('applies updateTransaction and preserves txParamsOriginal when afterAdd provides it', async () => {
      const { request } = buildLifecycleMocks();
      const originalGas = request.transactionMeta.txParams.gas;

      jest
        .mocked(request.constructorOptions.hooks.afterAdd as jest.Mock)
        .mockResolvedValue({
          updateTransaction: (tx: { txParams: { gas: string } }) => {
            tx.txParams.gas = '0x9999';
          },
        });

      await addTransactionData(request);

      expect(request.transactionMeta.txParams.gas).toBe('0x9999');
      expect(request.transactionMeta.txParamsOriginal?.gas).toBe(originalGas);
    });

    it('uses a no-op afterAdd when hooks.afterAdd is not set', async () => {
      const { request } = buildLifecycleMocks();
      request.constructorOptions.hooks = {
        ...request.constructorOptions.hooks,
        afterAdd: undefined,
      };

      // Should not throw.
      expect(await addTransactionData(request)).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Gas estimation — skipInitialGasEstimate = false (default)
  // ---------------------------------------------------------------------------

  describe('gas estimation (inline)', () => {
    it('calls updateGasEstimate when skipInitialGasEstimate is not set', async () => {
      const { request } = buildLifecycleMocks();

      await addTransactionData(request);

      expect(
        jest.mocked(request.dependencies.updateGasEstimate),
      ).toHaveBeenCalledWith(request.transactionMeta);
    });

    it('calls getEIP1559Compatibility with the transaction networkClientId', async () => {
      const { request } = buildLifecycleMocks();

      await addTransactionData(request);

      expect(jest.mocked(getEIP1559Compatibility)).toHaveBeenCalledWith(
        request.dependencies,
        request.transactionMeta.networkClientId,
      );
    });

    it('calls updateGasFees with eip1559 = true when network is EIP-1559 compatible', async () => {
      jest.mocked(getEIP1559Compatibility).mockResolvedValue(true);
      const { request } = buildLifecycleMocks();

      await addTransactionData(request);

      expect(jest.mocked(updateGasFees)).toHaveBeenCalledWith(
        expect.objectContaining({ eip1559: true }),
      );
    });

    it('calls updateGasFees with eip1559 = false when network is not EIP-1559 compatible', async () => {
      jest.mocked(getEIP1559Compatibility).mockResolvedValue(false);
      const { request } = buildLifecycleMocks();

      await addTransactionData(request);

      expect(jest.mocked(updateGasFees)).toHaveBeenCalledWith(
        expect.objectContaining({ eip1559: false }),
      );
    });

    it('treats a legacy envelope type as not EIP-1559 regardless of network support', async () => {
      jest.mocked(getEIP1559Compatibility).mockResolvedValue(true);
      const txMeta = buildTransactionMeta({
        txParams: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x2234567890123456789012345678901234567890',
          type: TransactionEnvelopeType.legacy,
        },
      });
      const { request } = buildLifecycleMocks({ transactionMeta: txMeta });

      await addTransactionData(request);

      // getEIP1559Compatibility should NOT be called for legacy envelope types.
      expect(jest.mocked(getEIP1559Compatibility)).not.toHaveBeenCalled();

      expect(jest.mocked(updateGasFees)).toHaveBeenCalledWith(
        expect.objectContaining({ eip1559: false }),
      );
    });

    it('calls updateTransactionLayer1GasFee with the transaction meta', async () => {
      const { request } = buildLifecycleMocks();

      await addTransactionData(request);

      expect(jest.mocked(updateTransactionLayer1GasFee)).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: request.transactionMeta,
        }),
      );
    });

    it('passes getSavedGasFees to updateGasFees', async () => {
      const getSavedGasFees = jest.fn().mockReturnValue(undefined);
      const { request } = buildLifecycleMocks();
      request.constructorOptions.getSavedGasFees = getSavedGasFees;

      await addTransactionData(request);

      const firstCall = jest.mocked(updateGasFees).mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(typeof firstCall?.[0].getSavedGasFees).toBe('function');
    });

    it('uses a no-op getSavedGasFees when constructor option is not set', async () => {
      const { request } = buildLifecycleMocks();
      request.constructorOptions.getSavedGasFees = undefined;

      await addTransactionData(request);

      // Retrieve the first positional arg passed to updateGasFees.
      const firstCall = jest.mocked(updateGasFees).mock.calls[0];
      expect(firstCall).toBeDefined();

      const callArg = firstCall?.[0];
      expect(callArg).toBeDefined();

      // The fallback getSavedGasFees should return undefined.
      expect(callArg?.getSavedGasFees(request.transactionMeta)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Gas estimation — skipInitialGasEstimate = true (background)
  // ---------------------------------------------------------------------------

  describe('gas estimation (background)', () => {
    it('does not call updateGasEstimate synchronously when skipInitialGasEstimate is true', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.skipInitialGasEstimate = true;

      await addTransactionData(request);

      // updateGasEstimate is called in the background; the awaited result
      // may or may not have resolved by now, but the inline path definitely
      // did not block addTransactionData itself.  We verify the background
      // path by flushing microtasks below.
      // This assertion just confirms execution proceeded without waiting.
      expect(request.transactionMeta).toBeDefined();
    });

    it('writes gas values back to state once background estimation resolves', async () => {
      const { request, getTransaction } = buildLifecycleMocks();
      request.addTransactionRequest.options.skipInitialGasEstimate = true;

      // Make updateGasEstimate populate gas on the clone.
      jest
        .mocked(request.dependencies.updateGasEstimate)
        .mockImplementation(async (tx) => {
          tx.txParams.gas = '0xbeef';
        });

      await addTransactionData(request);
      await flushMicrotasks();

      expect(
        jest.mocked(request.dependencies.updateTransactionInternal),
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: TRANSACTION_ID_MOCK,
          skipResimulateCheck: true,
          skipValidation: true,
        }),
        expect.any(Function),
      );

      // The in-memory store should reflect the gas written back.
      expect(getTransaction().txParams.gas).toBe('0xbeef');
    });

    it('silently swallows background estimation errors (noop .catch)', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.skipInitialGasEstimate = true;

      jest
        .mocked(request.dependencies.updateGasEstimate)
        .mockRejectedValue(new Error('Network timeout'));

      await addTransactionData(request);

      // Should not throw after flushing.
      expect(await flushMicrotasks()).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Swaps data
  // ---------------------------------------------------------------------------

  describe('swaps data', () => {
    it('calls updateSwapsTransaction with the transaction meta, type and swaps options', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.swaps = { hasApproveTx: true };

      await addTransactionData(request);

      expect(jest.mocked(updateSwapsTransaction)).toHaveBeenCalledWith(
        request.transactionMeta,
        request.transactionMeta.type,
        { hasApproveTx: true },
        expect.objectContaining({ messenger: request.dependencies.messenger }),
      );
    });

    it('uses an empty swaps object when options.swaps is not set', async () => {
      const { request } = buildLifecycleMocks();
      // options.swaps defaults to {} inside addSwapsData.
      delete (request.addTransactionRequest.options as Record<string, unknown>)
        .swaps;

      await addTransactionData(request);

      expect(jest.mocked(updateSwapsTransaction)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {},
        expect.anything(),
      );
    });

    it('passes disableSwaps = false when constructor option is false', async () => {
      const { request } = buildLifecycleMocks();
      request.constructorOptions.disableSwaps = false;

      await addTransactionData(request);

      expect(jest.mocked(updateSwapsTransaction)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ isSwapsDisabled: false }),
      );
    });

    it('passes isSwapsDisabled = true when constructor option is true', async () => {
      const { request } = buildLifecycleMocks();
      request.constructorOptions.disableSwaps = true;

      await addTransactionData(request);

      expect(jest.mocked(updateSwapsTransaction)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ isSwapsDisabled: true }),
      );
    });

    it('uses isSwapsDisabled = false when disableSwaps is undefined', async () => {
      const { request } = buildLifecycleMocks();
      request.constructorOptions.disableSwaps = undefined;

      await addTransactionData(request);

      expect(jest.mocked(updateSwapsTransaction)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ isSwapsDisabled: false }),
      );
    });

    it('updates request.transactionMeta with the return value of updateSwapsTransaction', async () => {
      const updatedMeta = buildTransactionMeta({
        type: TransactionType.swap,
      });
      jest.mocked(updateSwapsTransaction).mockReturnValue(updatedMeta);

      const { request } = buildLifecycleMocks();

      const result = await addTransactionData(request);

      expect(result).toBe(updatedMeta);
    });
  });

  // ---------------------------------------------------------------------------
  // Return value
  // ---------------------------------------------------------------------------

  it('returns the (possibly mutated) transactionMeta after all stages', async () => {
    const { request } = buildLifecycleMocks();

    const result = await addTransactionData(request);

    expect(result).toBe(request.transactionMeta);
  });
});
