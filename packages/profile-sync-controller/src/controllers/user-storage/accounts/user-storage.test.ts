import { getMockRandomDefaultAccountName } from '../__fixtures__/mockAccounts';
import {
  isNameDefaultAccountName,
  getDefaultNameAccountNumber,
} from './user-storage';

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

describe('user-storage/acounts/getDefaultNameAccountNumber', () => {
  it('should return the account number for a default account name', () => {
    expect(
      getDefaultNameAccountNumber(`${getMockRandomDefaultAccountName()} 89`),
    ).toBe(89);
    expect(
      getDefaultNameAccountNumber(`${getMockRandomDefaultAccountName()} 1`),
    ).toBe(1);
    expect(
      getDefaultNameAccountNumber(
        `${getMockRandomDefaultAccountName()} 123543`,
      ),
    ).toBe(123543);
  });

  it('should return false for non-default account names', () => {
    expect(getDefaultNameAccountNumber('My Account')).toBeUndefined();
    expect(getDefaultNameAccountNumber('Mon compte 34')).toBeUndefined();
  });
});
