import { getMockRandomDefaultAccountName } from '../__fixtures__/mockAccounts';
import { isNameDefaultAccountName } from './user-storage';

describe('user-storage/acounts/isNameDefaultAccountName', () => {
  it('should return true for default account names', () => {
    expect(
      isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 89`),
    ).toBe(true);
    expect(
      isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 1`),
    ).toBe(true);
    expect(
      isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 123543`),
    ).toBe(true);
  });

  it('should return false for non-default account names', () => {
    expect(isNameDefaultAccountName('My Account')).toBe(false);
    expect(isNameDefaultAccountName('Mon compte 34')).toBe(false);
  });
});
