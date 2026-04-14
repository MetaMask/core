import { Wallet } from '@metamask/wallet';

import { createWallet } from './wallet-factory';

jest.mock('@metamask/wallet');
jest.mock('@metamask/remote-feature-flag-controller');

const MockWallet = jest.mocked(Wallet);

describe('createWallet', () => {
  it('instantiates Wallet with the given infuraProjectId', () => {
    createWallet({ infuraProjectId: 'test-key' });

    expect(MockWallet).toHaveBeenCalledTimes(1);
    const args = MockWallet.mock.calls[0][0];
    expect(args.options.infuraProjectId).toBe('test-key');
  });

  it('uses expected default options', () => {
    createWallet({ infuraProjectId: 'test-key' });

    const args = MockWallet.mock.calls[0][0];
    expect(args.options.clientVersion).toBe('0.0.0');
    expect(args.options.showApprovalRequest()).toBeUndefined();
    expect(args.options.getMetaMetricsId()).toBe('cli');
    expect(args.options.clientConfigApiService).toBeDefined();
  });
});
