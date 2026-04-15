import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { ExternalProvider } from '@ethersproject/providers';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';

import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types';
import { toBN } from '../utils/utils';
import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';

const MANTLE_CHAIN_IDS: Hex[] = [CHAIN_IDS.MANTLE, CHAIN_IDS.MANTLE_SEPOLIA];

const TOKEN_RATIO_ABI = [
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
 * the fee to MNT.
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

  protected override async transformOracleFee(
    oracleFee: BN,
    request: Layer1GasFeeFlowRequest,
  ): Promise<BN> {
    const { provider, transactionMeta } = request;
    const oracleAddress = this.getOracleAddressForChain(
      transactionMeta.chainId,
    );

    const contract = new Contract(
      oracleAddress,
      TOKEN_RATIO_ABI,
      new Web3Provider(provider as unknown as ExternalProvider),
    );

    const tokenRatio = toBN(await contract.tokenRatio());
    return oracleFee.mul(tokenRatio);
  }
}
