import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLighterAccountIndex,
  getLighterTransferFee,
  isLighterTransferStep,
  subtractLighterTransferFee,
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

  describe('subtractLighterTransferFee', () => {
    it('subtracts the fee from the raw and formatted input', () => {
      const input = {
        asset: 'lighter:mainnet/perps:usdc' as const,
        decimals: 6,
        formatted: '10',
        raw: '10000000',
      };

      expect(subtractLighterTransferFee(input, new BigNumber(3))).toStrictEqual(
        { ...input, formatted: '7', raw: '7000000' },
      );
    });
  });
});
