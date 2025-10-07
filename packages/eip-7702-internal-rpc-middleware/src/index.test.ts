import {
  upgradeAccount,
  getAccountUpgradeStatus,
  walletUpgradeAccount,
  walletGetAccountUpgradeStatus,
} from '.';

describe('index', () => {
  it('exports upgradeAccount hook', () => {
    expect(upgradeAccount).toBeDefined();
    expect(typeof upgradeAccount).toBe('function');
  });

  it('exports getAccountUpgradeStatus hook', () => {
    expect(getAccountUpgradeStatus).toBeDefined();
    expect(typeof getAccountUpgradeStatus).toBe('function');
  });

  it('exports walletUpgradeAccount method', () => {
    expect(walletUpgradeAccount).toBeDefined();
    expect(typeof walletUpgradeAccount).toBe('function');
  });

  it('exports walletGetAccountUpgradeStatus method', () => {
    expect(walletGetAccountUpgradeStatus).toBeDefined();
    expect(typeof walletGetAccountUpgradeStatus).toBe('function');
  });
});
