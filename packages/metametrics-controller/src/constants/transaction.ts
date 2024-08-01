/**
 * Defines the possible types
 */
export enum TransactionMetaMetricsEvent {
  /**
   * All transactions, except incoming ones, are added to the controller state
   * in an unapproved status. When this happens we fire the Transaction Added
   * event to show that the transaction has been added to the user's MetaMask.
   */
  added = 'Transaction Added',
  /**
   * When an unapproved transaction is in the controller state, MetaMask will
   * render a confirmation screen for that transaction. If the user approves
   * the transaction we fire this event to indicate that the user has approved
   * the transaction for submission to the network.
   */
  approved = 'Transaction Approved',
  /**
   * All transactions that are submitted will finalized (eventually) by either
   * being dropped, failing or being confirmed. When this happens we track this
   * event, along with the status.
   */
  finalized = 'Transaction Finalized',
  /**
   * When an unapproved transaction is in the controller state, MetaMask will
   * render a confirmation screen for that transaction. If the user rejects the
   * transaction we fire this event to indicate that the user has rejected the
   * transaction. It will be removed from state as a result.
   */
  rejected = 'Transaction Rejected',
  /**
   * After a transaction is approved by the user, it is then submitted to the
   * network for inclusion in a block. When this happens we fire the
   * Transaction Submitted event to indicate that MetaMask is submitting a
   * transaction at the user's request.
   */
  submitted = 'Transaction Submitted',
}

export enum AnonymousTransactionMetaMetricsEvent {
  added = 'Transaction Added Anon',
  approved = 'Transaction Approved Anon',
  finalized = 'Transaction Finalized Anon',
  rejected = 'Transaction Rejected Anon',
  submitted = 'Transaction Submitted Anon',
}
