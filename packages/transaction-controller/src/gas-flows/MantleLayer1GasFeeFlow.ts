import { Interface } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';

import { CHAIN_IDS } from '../constants.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type { Layer1GasFeeFlowRequest, TransactionMeta } from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { toBN } from '../utils/utils.js';
import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow.js';

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

const TOKEN_RATIO_INTERFACE = new Interface(TOKEN_RATIO_ABI);

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

  protected override getOperatorFeeGas(
    transactionMeta: TransactionMeta,
  ): string | undefined {
    return (
      transactionMeta.gasUsed ??
      transactionMeta.txParams.gas ??
      transactionMeta.txParams.gasLimit
    );
  }

  protected override async transformOracleFee(
    oracleFee: BN,
    request: Layer1GasFeeFlowRequest,
  ): Promise<BN> {
    const { messenger, transactionMeta } = request;
    const { chainId, networkClientId } = transactionMeta;

    const to = this.getOracleAddressForChain(chainId);
    const data = TOKEN_RATIO_INTERFACE.encodeFunctionData(
      'tokenRatio',
      [],
    ) as Hex;

    // Direct `eth_call` RPC request rather than an ethers `Contract` with
    // `Web3Provider`, whose `setTimeout`-based dispatch never fires on React
    // Native when the timer pump is starved (e.g. iOS display link freeze).
    // See https://github.com/MetaMask/metamask-mobile/issues/32863
    const result = await rpcRequest({
      messenger,
      networkClientId,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    });

    if (typeof result !== 'string' || result === '0x') {
      throw new Error('No value returned from token ratio contract');
    }

    const tokenRatio = toBN(result);
    return oracleFee.mul(tokenRatio);
  }
}
