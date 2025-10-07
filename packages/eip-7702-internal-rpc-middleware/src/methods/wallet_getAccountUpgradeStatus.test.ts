import type {
  JsonRpcRequest,
  PendingJsonRpcResponse,
  Json,
} from '@metamask/utils';

import { walletGetAccountUpgradeStatus } from './wallet_getAccountUpgradeStatus';
import { getAccountUpgradeStatus } from '../hooks/getAccountUpgradeStatus';
import type { GetAccountUpgradeStatusHooks } from '../types';

jest.mock('../hooks/getAccountUpgradeStatus');

describe('walletGetAccountUpgradeStatus', () => {
  it('calls getAccountUpgradeStatus hook with correct parameters and sets result', async () => {
    const req = {} as JsonRpcRequest<Json[]> & { origin: string };
    const res = { result: null } as PendingJsonRpcResponse;
    const hooks = {
      getCurrentChainIdForDomain: jest.fn(),
      getCode: jest.fn(),
      getNetworkConfigurationByChainId: jest.fn(),
      getAccounts: jest.fn(),
    };

    const mockResult = { account: '0xabc', isUpgraded: true, chainId: 1 };
    (getAccountUpgradeStatus as jest.Mock).mockResolvedValue(mockResult);

    await walletGetAccountUpgradeStatus(req, res, hooks);

    expect(getAccountUpgradeStatus).toHaveBeenCalledWith(req, res, hooks);
    expect(res.result).toBe(mockResult);
  });

  it('throws methodNotSupported when getCode hook is not provided', async () => {
    const req = {} as JsonRpcRequest<Json[]> & { origin: string };
    const res = { result: null } as PendingJsonRpcResponse;
    const hooks = {
      getCurrentChainIdForDomain: jest.fn(),
      getCode: undefined as unknown as GetAccountUpgradeStatusHooks['getCode'],
      getNetworkConfigurationByChainId: jest.fn(),
      getAccounts: jest.fn(),
    };

    await expect(
      walletGetAccountUpgradeStatus(req, res, hooks),
    ).rejects.toThrow('Method not supported');
  });
});
