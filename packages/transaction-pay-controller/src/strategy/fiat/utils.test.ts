import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import { ETH_MAINNET_FIAT_ASSET, FIAT_ASSET_ID_BY_TX_TYPE } from './constants';
import { deriveFiatAssetForFiatPayment } from './utils';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { TransactionPayFiatAsset } from './constants';

const FEATURE_FLAG_ASSET_MOCK: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000000abc',
  chainId: '0xa',
};

describe('Fiat Utils', () => {
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });
  });

  describe('deriveFiatAssetForFiatPayment', () => {
    it('returns asset from feature flag when present', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.predictDeposit]: FEATURE_FLAG_ASSET_MOCK,
            },
          },
        },
      });

      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(FEATURE_FLAG_ASSET_MOCK);
    });

    it('returns feature flag asset over hardcoded asset when both exist', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.predictDeposit]: FEATURE_FLAG_ASSET_MOCK,
            },
          },
        },
      });

      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(FEATURE_FLAG_ASSET_MOCK);
      expect(result).not.toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('returns hardcoded asset when feature flag has no entry for the type', () => {
      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('returns hardcoded asset for direct transaction type', () => {
      const transaction = {
        type: TransactionType.perpsDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('returns hardcoded asset for supported nested transaction in batch', () => {
      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('skips unsupported nested types and finds supported one in batch', () => {
      const transaction = {
        nestedTransactions: [
          { type: TransactionType.tokenMethodApprove },
          { type: TransactionType.perpsDeposit },
        ],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('returns feature flag asset for supported nested transaction in batch', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            assetPerTransactionType: {
              [TransactionType.perpsDeposit]: FEATURE_FLAG_ASSET_MOCK,
            },
          },
        },
      });

      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(FEATURE_FLAG_ASSET_MOCK);
    });

    it('returns ETH mainnet fallback for unsupported type', () => {
      const transaction = {
        type: TransactionType.contractInteraction,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(ETH_MAINNET_FIAT_ASSET);
    });

    it('returns ETH mainnet fallback for batch with no nested transactions', () => {
      const transaction = {
        nestedTransactions: [],
        type: TransactionType.batch,
      } as unknown as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction, messenger);

      expect(result).toStrictEqual(ETH_MAINNET_FIAT_ASSET);
    });
  });
});
