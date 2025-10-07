import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { walletUpgradeAccount } from './wallet_upgradeAccount';
import { upgradeAccount } from '../hooks/upgradeAccount';
import type { UpgradeAccountHooks } from '../types';

jest.mock('../hooks/upgradeAccount');

describe('walletUpgradeAccount', () => {
  it('calls upgradeAccount hook with correct parameters and sets result', async () => {
    const req = {} as JsonRpcRequest<Json[]> & { origin: string };
    const res = { result: null } as PendingJsonRpcResponse;
    const hooks = {
      upgradeAccount: jest.fn(),
      getCurrentChainIdForDomain: jest.fn(),
      isAtomicBatchSupported: jest.fn(),
      getAccounts: jest.fn(),
    };

    const mockResult = {
      transactionHash: '0x123',
      upgradedAccount: '0xabc',
      delegatedTo: '0xdef',
    };
    (upgradeAccount as jest.Mock).mockResolvedValue(mockResult);

    await walletUpgradeAccount(req, res, hooks);

    expect(upgradeAccount).toHaveBeenCalledWith(req, res, hooks);
    expect(res.result).toBe(mockResult);
  });

  it('throws methodNotSupported when upgradeAccount hook is not provided', async () => {
    const req = {} as JsonRpcRequest<Json[]> & { origin: string };
    const res = { result: null } as PendingJsonRpcResponse;
    const hooks = {
      upgradeAccount:
        undefined as unknown as UpgradeAccountHooks['upgradeAccount'],
      getCurrentChainIdForDomain: jest.fn(),
      isAtomicBatchSupported: jest.fn(),
      getAccounts: jest.fn(),
    };

    await expect(walletUpgradeAccount(req, res, hooks)).rejects.toThrow(
      'Method not supported',
    );
  });
});
