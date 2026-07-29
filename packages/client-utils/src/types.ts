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
  | 'assetDeactivation'
  | 'rampBuy'
  | 'rampSell';

export type Status = 'pending' | 'success' | 'failed' | 'cancelled';

export type AssetType = 'native' | 'erc20' | 'erc721' | 'erc1155';

export type TokenAmount = {
  amount?: string;
  decimals?: number;
  symbol?: string;
  assetId?: string;
  assetType?: AssetType;
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
  assetType?: AssetType;
};

type ActivityData<Type extends ActivityKind, Data, ChainId = CaipChainId> = {
  type: Type;
  chainId: ChainId;
  status: Status;
  timestamp: number;
  hash?: string;
  data: Data;
};

/**
 * Bank transfer instruction fields attached to a ramp order by providers
 * that require manual payment (e.g. SEPA, wire transfer).
 */
export type RampOrderPaymentDetail = {
  fiatCurrency: string;
  paymentMethod: string;
  fields: { name: string; id: string; value: string }[];
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
    >
  | (ActivityData<
      'rampBuy' | 'rampSell',
      {
        from?: string;
        fiat?: FiatAmount;
        token?: TokenAmount;
        fees?: Fee[];
        provider?: {
          id?: string;
          name?: string;
          orderLink?: string;
        };
        statusDescription?: string;
        paymentDetails?: RampOrderPaymentDetail[];
      },
      // Precreated stub orders (see `RampsController.addPrecreatedOrder`) may
      // not have an assigned network yet, so unlike every other activity
      // kind, a ramp order's chain id isn't guaranteed.
      CaipChainId | undefined
    > & {
      // Stable identifier for orders that may not have a hash yet (e.g. a
      // ramp order pending fiat settlement, where `hash` is empty until it
      // settles on-chain). Sits next to `hash` since, like `hash`, it's a
      // cross-kind identity concept — scoped to this union arm only, since no
      // other activity kind needs it today.
      id?: string;
    });

// Note: Update core-backend
export type ValueTransfer = _ValueTransfer & {
  contractAddress: string;
  symbol: string;
  name: string;
};
