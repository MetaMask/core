import { Interface } from '@ethersproject/abi';
import type { GasEstimationStrategy } from '@metamask/config-registry-controller';
import type { Hex } from '@metamask/utils';
import { add0x, createModuleLogger } from '@metamask/utils';
import BN from 'bn.js';

import { projectLogger } from '../logger.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type {
  Layer1GasFeeFlow,
  Layer1GasFeeFlowRequest,
  Layer1GasFeeFlowResponse,
  TransactionMeta,
} from '../types.js';
import { prepareTransaction } from '../utils/prepare.js';
import { rpcRequest } from '../utils/provider.js';
import { padHexToEvenLength, toBN } from '../utils/utils.js';

const log = createModuleLogger(projectLogger, 'oracle-layer1-gas-fee-flow');

const ZERO = new BN(0);

const DUMMY_KEY =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const GAS_PRICE_ORACLE_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    name: 'getL1Fee',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // only available post Isthmus
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_gasUsed',
        type: 'uint256',
      },
    ],
    name: 'getOperatorFee',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

// Default OP Stack gas price oracle address used across supported networks
const DEFAULT_GAS_PRICE_ORACLE_ADDRESS =
  '0x420000000000000000000000000000000000000F' as Hex;

const GAS_PRICE_ORACLE_INTERFACE = new Interface(GAS_PRICE_ORACLE_ABI);

type GetRegistryGasStrategyForChain = (
  chainId: Hex,
) => GasEstimationStrategy | undefined;

/**
 * Layer 1 gas fee flow that obtains gas fee estimate using an oracle smart contract.
 */
export abstract class OracleLayer1GasFeeFlow implements Layer1GasFeeFlow {
  /**
   * Optional lookup of the Config Registry network configuration,
   * used to source the layer 1 oracle address from the registry before
   * falling back to bundled constants.
   */
  protected readonly getRegistryGasStrategyForChain?: GetRegistryGasStrategyForChain;

  constructor({
    getRegistryGasStrategyForChain,
  }: {
    getRegistryGasStrategyForChain?: GetRegistryGasStrategyForChain;
  } = {}) {
    this.getRegistryGasStrategyForChain = getRegistryGasStrategyForChain;
  }

  /**
   * Resolves the oracle address for the given chain. Subclasses can override
   * this method to provide chain-specific oracle addresses. By default, this
   * uses the registry-provided oracle address when present, otherwise the
   * standard OP Stack gas price oracle address.
   *
   * @param chainId - The chain ID to resolve the oracle address for.
   * @returns The oracle address for the given chain.
   */
  protected getOracleAddressForChain(chainId: Hex): Hex {
    return (
      this.getRegistryGasStrategyForChain?.(chainId)?.l1OracleAddress ??
      DEFAULT_GAS_PRICE_ORACLE_ADDRESS
    );
  }

  /**
   * Whether to sign the transaction with a dummy key prior to calling the
   * oracle contract. Some oracle contracts require a signed payload even for
   * read-only methods.
   *
   * Subclasses can override to enable signing when needed. Defaults to false.
   *
   * @returns Whether the transaction should be signed prior to the oracle call.
   */
  protected shouldSignTransaction(): boolean {
    return false;
  }

  abstract matchesTransaction({
    transactionMeta,
    messenger,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): Promise<boolean>;

  /**
   * Transforms the raw oracle L1 fee before it is combined with the operator
   * fee. Subclasses can override this to apply chain-specific conversions
   * (e.g. currency conversion via an on-chain exchange rate).
   *
   * Defaults to returning the fee unchanged.
   *
   * @param oracleFee - The raw L1 fee returned by the oracle contract.
   * @param _request - The original fee flow request (messenger + transaction).
   * @returns The transformed fee.
   */
  protected async transformOracleFee(
    oracleFee: BN,
    _request: Layer1GasFeeFlowRequest,
  ): Promise<BN> {
    return oracleFee;
  }

  async getLayer1Fee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    try {
      const oracleFee = await this.#getOracleLayer1GasFee(request);
      const transformedFee = await this.transformOracleFee(oracleFee, request);
      const operatorFee = await this.#getOperatorLayer1GasFee(request);

      return {
        layer1Fee: add0x(
          padHexToEvenLength(transformedFee.add(operatorFee).toString(16)),
        ),
      };
    } catch (error) {
      log('Failed to get oracle layer 1 gas fee', error);
      throw new Error(`Failed to get oracle layer 1 gas fee`);
    }
  }

  async #getOracleLayer1GasFee(request: Layer1GasFeeFlowRequest): Promise<BN> {
    const serializedTransaction = this.#buildUnserializedTransaction(
      request.transactionMeta,
      this.shouldSignTransaction(),
    ).serialize();

    const result = await this.#callGasPriceOracle(request, 'getL1Fee', [
      serializedTransaction,
    ]);

    if (typeof result !== 'string' || result === '0x') {
      throw new Error('No value returned from oracle contract');
    }

    return toBN(result);
  }

  /**
   * Returns the gas value to pass to the operator-fee oracle, or undefined
   * to skip the operator-fee call entirely. Defaults to the simulated
   * `gasUsed` on the transaction. Subclasses can override to supply a
   * fallback (e.g. estimated gas limit) when `gasUsed` is unavailable.
   *
   * @param transactionMeta - The transaction metadata.
   * @returns The gas value, or undefined to skip the operator-fee call.
   */
  protected getOperatorFeeGas(
    transactionMeta: TransactionMeta,
  ): string | undefined {
    return transactionMeta.gasUsed;
  }

  async #getOperatorLayer1GasFee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<BN> {
    const gas = this.getOperatorFeeGas(request.transactionMeta);

    if (!gas) {
      return ZERO;
    }

    try {
      const result = await this.#callGasPriceOracle(request, 'getOperatorFee', [
        gas,
      ]);

      if (typeof result !== 'string' || result === '0x') {
        return ZERO;
      }

      return toBN(result);
    } catch (error) {
      log('Failed to get operator layer 1 gas fee', error);
      return ZERO;
    }
  }

  #buildUnserializedTransaction(
    transactionMeta: TransactionMeta,
    sign: boolean,
  ): ReturnType<typeof prepareTransaction> {
    const txParams = this.#buildTransactionParams(transactionMeta);
    const { chainId } = transactionMeta;

    let unserializedTransaction = prepareTransaction(chainId, txParams);

    if (sign) {
      // eslint-disable-next-line no-restricted-globals
      const keyBuffer = Buffer.from(DUMMY_KEY, 'hex');
      const keyBytes = Uint8Array.from(keyBuffer);
      unserializedTransaction = unserializedTransaction.sign(keyBytes);
    }

    return unserializedTransaction;
  }

  #buildTransactionParams(
    transactionMeta: TransactionMeta,
  ): TransactionMeta['txParams'] {
    return {
      ...transactionMeta.txParams,
      gasLimit: transactionMeta.txParams.gas,
    };
  }

  // The oracle is called via a direct `eth_call` RPC request rather than an
  // ethers `Contract` with `Web3Provider`, as `Web3Provider` schedules its
  // JSON-RPC dispatch with `setTimeout`, which never fires on React Native
  // when the timer pump is starved (e.g. iOS display link freeze), blocking
  // `addTransaction` indefinitely.
  // See https://github.com/MetaMask/metamask-mobile/issues/32863
  async #callGasPriceOracle(
    request: Layer1GasFeeFlowRequest,
    functionName: string,
    args: readonly unknown[],
  ): Promise<unknown> {
    const { messenger, transactionMeta } = request;
    const { chainId, networkClientId } = transactionMeta;

    const to = this.getOracleAddressForChain(chainId);
    const data = GAS_PRICE_ORACLE_INTERFACE.encodeFunctionData(
      functionName,
      args,
    ) as Hex;

    return await rpcRequest({
      messenger,
      networkClientId,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    });
  }
}
