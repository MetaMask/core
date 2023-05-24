export enum TransactionStatus {
  /**
   * A new transaction that the user has not approved or rejected
   */
  unapproved = 'unapproved',
  /**
   * The user has approved the transaction in the MetaMask UI
   */
  approved = 'approved',
  /**
   * The user has rejected the transaction in the MetaMask UI
   */
  rejected = 'rejected',
  /**
   * The transaction has been signed
   */
  signed = 'signed',
  /**
   * The transaction has been submitted to network
   */
  submitted = 'submitted',
  /**
   * The transaction has failed for some reason
   */
  failed = 'failed',
  /**
   * The transaction was dropped due to a tx with same nonce being accepted
   */
  dropped = 'dropped',
  /**
   * The transaction was confirmed by the network
   */
  confirmed = 'confirmed',
  /**
   * The transaction has been signed and is waiting to either be confirmed,
   * dropped or failed. This is a "fake" status that we use to group statuses
   * that are very similar from the user's perspective (approved,
   * signed, submitted). The only notable case where approve and signed are
   * different from user perspective is in hardware wallets where the
   * transaction is signed on an external device. Otherwise signing happens
   * transparently to users.
   */
  pending = 'pending',
}

export const FINALIZED_TRANSACTION_STATUSES = [
  TransactionStatus.rejected,
  TransactionStatus.failed,
  TransactionStatus.dropped,
  TransactionStatus.confirmed,
];