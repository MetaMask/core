import { toHex } from '@metamask/controller-utils';
import {
  ARBITRUM_MAINNET_CHAIN_ID_HEX,
  DEPOSIT_CONFIG,
  HYPERLIQUID_BRIDGE_CONTRACTS,
  USDC_ARBITRUM_MAINNET_ADDRESS,
} from '@metamask/perps-controller/constants/hyperLiquidConfig';
import { generateERC20TransferData } from '@metamask/perps-controller/utils/transferData';
import { TransactionType } from '@metamask/transaction-controller';

import type { WalletPayFlow } from '../../types.js';
import { assertPerpsEligible, toUsdcAmountRaw } from './shared.js';

/**
 * `perpsDeposit`: a USDC transfer to the Hyperliquid bridge on Arbitrum,
 * matching the in-wallet deposit. Uses the mainnet route directly, while the
 * in-wallet flow takes it from the active perps provider.
 */
export const perpsDepositFlow: WalletPayFlow = {
  assertPreconditions: assertPerpsEligible,
  build: ({ from, amount }) => ({
    chainId: ARBITRUM_MAINNET_CHAIN_ID_HEX,
    transactionParams: {
      from,
      to: USDC_ARBITRUM_MAINNET_ADDRESS,
      value: '0x0',
      data: generateERC20TransferData(
        HYPERLIQUID_BRIDGE_CONTRACTS.mainnet.contractAddress,
        toUsdcAmountRaw(amount),
      ),
      gas: toHex(DEPOSIT_CONFIG.EstimatedGasLimit),
    },
    type: TransactionType.perpsDeposit,
    skipInitialGasEstimate: true,
  }),
};
