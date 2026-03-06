import { TransactionType } from './types';

describe('TransactionType', () => {
  it('includes predictDepositAndOrder', () => {
    expect(TransactionType.predictDepositAndOrder).toBe(
      'predictDepositAndOrder',
    );
  });
});
