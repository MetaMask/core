import type { ValueTransfer as _ValueTransfer } from '@metamask/core-backend';
import type { CaipChainId } from '@metamask/utils';

export type ActivityKind =
  | 'receive'
  | 'sell'
  | 'buy'
  | 'deposit'
  | 'swap'
  | 'claim'
  | 'claimMusdBonus'
  | 'send'
  | 'wrap'
  | 'unwrap'
  | 'approveSpendingCap'
  | 'revokeSpendingCap'
  | 'increaseSpendingCap'
  | 'contractInteraction'
  | 'contractDeployment'
  | 'bridge'
  | 'convert'
  | 'nftBuy'
  | 'nftMint'
  | 'nftSell'
  | 'smartAccountUpgrade'
  | 'lendingDeposit'
  | 'lendingWithdrawal'
  | 'predictionsAddFunds'
  | 'predictionsWithdrawFunds'
  | 'predictionClaimWinnings'
  | 'predictionCashedOut'
  | 'predictionPlaced'
  | 'perpsAddFunds'
  | 'perpsWithdraw'
  | 'perpsOpenLong'
  | 'perpsCloseLong'
  | 'perpsCloseLongLiquidated'
  | 'perpsCloseLongStopLoss'
  | 'perpsOpenShort'
  | 'perpsCloseShort'
  | 'perpsCloseShortLiquidated'
  | 'perpsCloseShortStopLoss'
  | 'perpsPaidFundingFees'
  | 'perpsReceivedFundingFees'
  | 'perpsCloseShortTakeProfit'
  | 'perpsCloseLongTakeProfit'
  | 'marketShort'
  | 'stopMarketCloseShort'
  | 'marketCloseShort'
  | 'assetActivation'
  | 'assetDeactivation';

export type Status = 'pending' | 'success' | 'failed' | 'cancelled';

export type TokenAmount = {
  amount?: string;
  decimals?: number;
  symbol?: string;
  assetId?: string;
  direction: 'in' | 'out';
};

export type FiatAmount = {
  amount: string;
  currency?: string;
};

export type Fee = {
  type: string;
  amount?: string;
  decimals?: number;
  symbol?: string;
  assetId?: string;
};

type ActivityData<Type extends ActivityKind, Data> = {
  type: Type;
  chainId: CaipChainId;
  status: Status;
  timestamp: number;
  hash?: string;
  data: Data;
};

export type ActivityItem =
  | ActivityData<
      'approveSpendingCap' | 'revokeSpendingCap' | 'increaseSpendingCap',
      {
        from?: string;
        token?: TokenAmount;
        fees?: Fee[];
      }
    >
  | ActivityData<
      'assetActivation' | 'assetDeactivation',
      {
        from?: string;
        token?: TokenAmount;
        fees?: Fee[];
      }
    >
  | ActivityData<
      'send' | 'receive',
      {
        from: string;
        to: string;
        token?: TokenAmount;
        fees?: Fee[];
      }
    >
  | ActivityData<
      'nftBuy' | 'nftMint' | 'nftSell',
      {
        from?: string;
        to?: string;
        token?: TokenAmount;
        paymentToken?: TokenAmount;
      }
    >
  | ActivityData<
      | 'swap'
      | 'bridge'
      | 'convert'
      | 'lendingDeposit'
      | 'lendingWithdrawal'
      | 'wrap'
      | 'unwrap',
      {
        from?: string;
        sourceToken?: TokenAmount;
        destinationToken?: TokenAmount;
        fees?: Fee[];
      }
    >
  | ActivityData<
      'buy' | 'claim' | 'deposit' | 'claimMusdBonus',
      {
        from?: string;
        token?: TokenAmount;
      }
    >
  | ActivityData<
      'perpsAddFunds' | 'perpsWithdraw',
      {
        from?: string;
        fiat?: FiatAmount;
        networkFee?: FiatAmount;
        token?: TokenAmount;
      }
    >
  | ActivityData<
      'contractInteraction',
      {
        from: string;
        to: string;
        token?: TokenAmount;
        fees?: Fee[];
        methodId?: string;
        transactionCategory?: string;
        transactionProtocol?: string;
      }
    >;

// Note: Update core-backend
export type ValueTransfer = _ValueTransfer & {
  contractAddress: string;
  symbol: string;
  name: string;
};
