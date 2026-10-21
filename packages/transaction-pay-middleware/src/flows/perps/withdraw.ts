import {
  ARBITRUM_MAINNET_CHAIN_ID_HEX,
  USDC_ARBITRUM_MAINNET_ADDRESS,
} from '@metamask/perps-controller/constants/hyperLiquidConfig';
import { generateERC20TransferData } from '@metamask/perps-controller/utils/transferData';
import { TransactionType } from '@metamask/transaction-controller';

import type { WalletPayFlow } from '../../types.js';
import { isPayFlowEnabled } from '../../utils/feature-flags.js';
import { assertPerpsEligible, toUsdcAmountRaw } from './shared.js';

/**
 * `perpsWithdraw`: the same placeholder USDC transfer to `from` the in-wallet
 * withdraw uses; the confirmation and Pay turn it into the Hyperliquid
 * withdraw. Gas isn't estimated upfront: the funds are on Hyperliquid, so the
 * placeholder transfer would fail to estimate.
 */
export const perpsWithdrawFlow: WalletPayFlow = {
  // Reuses the in-wallet withdraw flow, so it also needs that flow's flag.
  isEnabled: (remoteFeatureFlags) =>
    isPayFlowEnabled(remoteFeatureFlags, TransactionType.perpsWithdraw),
  assertPreconditions: assertPerpsEligible,
  build: ({ from, amount }) => ({
    chainId: ARBITRUM_MAINNET_CHAIN_ID_HEX,
    transactionParams: {
      from,
      to: USDC_ARBITRUM_MAINNET_ADDRESS,
      value: '0x0',
      data: generateERC20TransferData(from, toUsdcAmountRaw(amount)),
    },
    type: TransactionType.perpsWithdraw,
    skipInitialGasEstimate: true,
  }),
};
