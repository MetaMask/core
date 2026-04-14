import { importSecretRecoveryPhrase, Wallet } from '@metamask/wallet';

import { createWallet } from './wallet-factory';

jest.mock('@metamask/wallet');
jest.mock('@metamask/remote-feature-flag-controller');

const MockWallet = jest.mocked(Wallet);
const mockImportSrp = jest.mocked(importSecretRecoveryPhrase);

const CONFIG = {
  infuraProjectId: 'test-key',
  password: 'test-pass',
  srp: 'test test test test test test test test test test test ball',
};

describe('createWallet', () => {
  it('instantiates Wallet with the given infuraProjectId', async () => {
    await createWallet(CONFIG);

    expect(MockWallet).toHaveBeenCalledTimes(1);
    const args = MockWallet.mock.calls[0][0];
    expect(args.options.infuraProjectId).toBe('test-key');
  });

  it('uses expected default options', async () => {
    await createWallet(CONFIG);

    const args = MockWallet.mock.calls[0][0];
    expect(args.options.clientVersion).toBe('0.0.0');
    expect(args.options.showApprovalRequest()).toBeUndefined();
    expect(args.options.getMetaMetricsId()).toBe('cli');
    expect(args.options.clientConfigApiService).toBeDefined();
  });

  it('imports the secret recovery phrase with the given password', async () => {
    await createWallet(CONFIG);

    expect(mockImportSrp).toHaveBeenCalledWith(
      expect.any(Wallet),
      'test-pass',
      'test test test test test test test test test test test ball',
    );
  });

  it('returns the wallet instance', async () => {
    const wallet = await createWallet(CONFIG);
    expect(wallet).toBeInstanceOf(Wallet);
  });
});
