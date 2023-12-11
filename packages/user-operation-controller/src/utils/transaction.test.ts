import { UserOperationStatus, type UserOperationMetadata } from '../types';
import { getTransactionMetadata } from './transaction';

const USER_OPERATION_METADATA_MOCK: UserOperationMetadata = {
  id: 'testUserOperationId',
  status: UserOperationStatus.Submitted,
} as any;

describe('transation', () => {
  describe('getTransactionMetadata', () => {
    it('returns undefined if no transactionParams', () => {
      const metadata = USER_OPERATION_METADATA_MOCK;
      expect(getTransactionMetadata(metadata)).toBeUndefined();
    });
  });
});
