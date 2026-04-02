import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { ExternalProvider } from '@ethersproject/providers';
import type { Hex } from '@metamask/utils';
import { add0x, createModuleLogger } from '@metamask/utils';
import BN from 'bn.js';

import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';
import { CHAIN_IDS } from '../constants';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  Layer1GasFeeFlowRequest,
  Layer1GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { prepareTransaction } from '../utils/prepare';
import { padHexToEvenLength, toBN } from '../utils/utils';

const log = createModuleLogger(projectLogger, 'mantle-layer1-gas-fee-flow');

const MANTLE_CHAIN_IDS: Hex[] = [CHAIN_IDS.MANTLE];

const ZERO = new BN(0);

// tokenRatio is a raw multiplier (ETH/MNT exchange rate as an integer).
// No decimal scaling needed — multiply L1 fee (ETH wei) by tokenRatio
// to get the equivalent fee in MNT wei.

const MANTLE_GAS_PRICE_ORACLE_ABI = [
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
  {
    inputs: [],
    name: 'tokenRatio',
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

/**
 * Mantle layer 1 gas fee flow.
 *
 * Mantle uses MNT as its native gas token, but the oracle's getL1Fee returns
 * values denominated in ETH. This subclass multiplies the L1 fee by the
 * tokenRatio (ETH/MNT exchange rate) from the oracle contract to convert
 * the fee to MNT, then adds the operator fee (already in MNT).
 */
export class MantleLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  async matchesTransaction({
    transactionMeta,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): Promise<boolean> {
    return MANTLE_CHAIN_IDS.includes(transactionMeta.chainId);
  }

  override async getLayer1Fee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    try {
      const { provider, transactionMeta } = request;
      const oracleAddress = this.getOracleAddressForChain(
        transactionMeta.chainId,
      );

      const contract = new Contract(
        oracleAddress,
        MANTLE_GAS_PRICE_ORACLE_ABI,
        new Web3Provider(provider as unknown as ExternalProvider),
      );

      // Get L1 fee (ETH-denominated)
      const serializedTransaction = prepareTransaction(
        transactionMeta.chainId,
        {
          ...transactionMeta.txParams,
          gasLimit: transactionMeta.txParams.gas,
        },
      ).serialize();

      const l1FeeResult = await contract.getL1Fee(serializedTransaction);
      if (l1FeeResult === undefined) {
        throw new Error('No value returned from oracle contract');
      }
      const l1Fee = toBN(l1FeeResult);

      // Convert L1 fee from ETH to MNT using tokenRatio (raw multiplier)
      const tokenRatio = toBN(await contract.tokenRatio());
      const l1FeeInMnt = l1Fee.mul(tokenRatio);

      // Get operator fee (already in MNT)
      let operatorFee = ZERO;
      const { gasUsed } = transactionMeta;
      if (gasUsed) {
        try {
          const operatorFeeResult = await contract.getOperatorFee(gasUsed);
          if (operatorFeeResult !== undefined) {
            operatorFee = toBN(operatorFeeResult);
          }
        } catch (error) {
          log('Failed to get operator fee, defaulting to zero', error);
        }
      }

      const totalFee = l1FeeInMnt.add(operatorFee);

      return {
        layer1Fee: add0x(padHexToEvenLength(totalFee.toString(16))),
      };
    } catch (error) {
      log('Failed to get Mantle layer 1 gas fee', error);
      throw new Error('Failed to get Mantle layer 1 gas fee');
    }
  }
}
