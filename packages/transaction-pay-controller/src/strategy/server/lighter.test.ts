import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentOverride } from '../../constants.js';
import type { QuoteRequest } from '../../types.js';
import {
  getLighterAccountIndex,
  getLighterTransferFee,
  isLighterAsset,
  isLighterSourceRequest,
  isLighterTransferStep,
  LighterNormalizer,
  processLighterRequest,
} from './lighter.js';
import type { ServerLighterTransferStep, ServerStep } from './types.js';

vi.mock(import('@metamask/controller-utils'), async (importOriginal) => ({
  ...(await importOriginal()),
  successfulFetch: vi.fn(),
}));

const L1_ADDRESS_MOCK = '0x8e411796cbc6a40d47ef1b81c871c7e7fe522839' as Hex;

const mockAccounts = (subAccounts?: unknown[]): void => {
  vi.mocked(successfulFetch).mockResolvedValue({
    json: async () => ({ sub_accounts: subAccounts }),
  } as Response);
};

describe('getLighterAccountIndex', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the index of the main account', async () => {
    mockAccounts([
      { account_type: 1, index: 5 },
      { account_type: 0, index: 770167 },
    ]);

    expect(await getLighterAccountIndex(L1_ADDRESS_MOCK)).toBe('770167');
    expect(successfulFetch).toHaveBeenCalledWith(
      `https://mainnet.zklighter.elliot.ai/api/v1/accountsByL1Address?l1_address=${L1_ADDRESS_MOCK}`,
    );
  });

  it('throws if there is no main account', async () => {
    mockAccounts([{ account_type: 1, index: 5 }]);

    await expect(getLighterAccountIndex(L1_ADDRESS_MOCK)).rejects.toThrow(
      `No Lighter account found for ${L1_ADDRESS_MOCK}`,
    );
  });

  it('throws if the response has no accounts', async () => {
    mockAccounts(undefined);

    await expect(getLighterAccountIndex(L1_ADDRESS_MOCK)).rejects.toThrow(
      'No Lighter account found',
    );
  });
});

describe('processLighterRequest', () => {
  const request = (overrides: Partial<QuoteRequest>): QuoteRequest =>
    overrides as QuoteRequest;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAccounts([{ account_type: 0, index: 770167 }]);
  });

  it('returns the account index as recipient for a deposit', async () => {
    expect(
      await processLighterRequest(
        request({ paymentOverride: PaymentOverride.PerpsLighter }),
        L1_ADDRESS_MOCK,
      ),
    ).toStrictEqual({ recipient: '770167' });
  });

  it('returns the declared asset and account index as source for a withdrawal', async () => {
    expect(
      await processLighterRequest(
        request({ sourceAssetIdOverride: 'lighter:mainnet/perps:usdc' }),
        L1_ADDRESS_MOCK,
      ),
    ).toStrictEqual({
      source: { asset: 'lighter:mainnet/perps:usdc', sender: '770167' },
    });
  });

  it('returns undefined and skips the lookup if the request does not involve Lighter', async () => {
    expect(
      await processLighterRequest(request({}), L1_ADDRESS_MOCK),
    ).toBeUndefined();
    expect(successfulFetch).not.toHaveBeenCalled();
  });
});

describe('Lighter transfer steps', () => {
  const TRANSFER_STEP_MOCK: ServerLighterTransferStep = {
    amount: 1000000,
    assetIndex: 3,
    fromRouteType: 0,
    memo: `0x${'ab'.repeat(32)}`,
    toAccountIndex: 723071,
    toRouteType: 0,
    type: 'lighterTransfer',
    usdcFee: 3000000,
  };

  const SIGNATURE_STEP_MOCK = { type: 'signature' } as unknown as ServerStep;

  describe('isLighterTransferStep', () => {
    it('is true for a Lighter transfer step', () => {
      expect(isLighterTransferStep(TRANSFER_STEP_MOCK)).toBe(true);
    });

    it('is false for another step', () => {
      expect(isLighterTransferStep(SIGNATURE_STEP_MOCK)).toBe(false);
    });
  });

  describe('getLighterTransferFee', () => {
    it('sums the fees of the transfer steps in USDC', () => {
      const fee = getLighterTransferFee([
        TRANSFER_STEP_MOCK,
        { ...TRANSFER_STEP_MOCK, usdcFee: 500000 },
        SIGNATURE_STEP_MOCK,
      ]);

      expect(fee.toString(10)).toBe('3.5');
    });

    it('is zero without transfer steps', () => {
      expect(getLighterTransferFee([SIGNATURE_STEP_MOCK]).toString(10)).toBe(
        '0',
      );
    });
  });
});

describe('Lighter assets', () => {
  describe('isLighterAsset', () => {
    it('is true for a Lighter asset', () => {
      expect(isLighterAsset('lighter:mainnet/perps:usdc')).toBe(true);
    });

    it('is false for another asset', () => {
      expect(isLighterAsset('hyperliq:mainnet/perps:usdc')).toBe(false);
    });

    it('is false without an asset', () => {
      expect(isLighterAsset(undefined)).toBe(false);
    });
  });

  describe('LighterNormalizer.isLighterRequest', () => {
    const request = (overrides: Partial<QuoteRequest>): QuoteRequest =>
      overrides as QuoteRequest;

    it('is true for the perpsLighter payment override', () => {
      expect(
        LighterNormalizer.isLighterRequest(
          request({ paymentOverride: PaymentOverride.PerpsLighter }),
        ),
      ).toBe(true);
    });

    it('is true when the client declared a Lighter target asset, whatever the payment override', () => {
      expect(
        LighterNormalizer.isLighterRequest(
          request({
            paymentOverride: PaymentOverride.MoneyAccount,
            targetAssetIdOverride: 'lighter:mainnet/perps:usdc',
          }),
        ),
      ).toBe(true);
    });

    it('is false for another payment override and no Lighter target asset', () => {
      expect(
        LighterNormalizer.isLighterRequest(
          request({ paymentOverride: PaymentOverride.MoneyAccount }),
        ),
      ).toBe(false);
    });

    it('is false for a Lighter source asset', () => {
      expect(
        LighterNormalizer.isLighterRequest(
          request({ sourceAssetIdOverride: 'lighter:mainnet/perps:usdc' }),
        ),
      ).toBe(false);
    });
  });

  describe('isLighterSourceRequest', () => {
    it('is true when the client declared a Lighter source asset', () => {
      expect(
        isLighterSourceRequest({
          sourceAssetIdOverride: 'lighter:mainnet/perps:usdc',
        }),
      ).toBe(true);
    });

    it('is false without a declared source asset', () => {
      expect(isLighterSourceRequest({})).toBe(false);
    });
  });
});
