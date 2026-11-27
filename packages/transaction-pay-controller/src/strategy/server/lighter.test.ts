import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLighterAccountIndex } from './lighter.js';

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
