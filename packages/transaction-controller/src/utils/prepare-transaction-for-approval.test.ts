import { cloneDeep } from 'lodash';

import type { TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import type {
  PrepareTransactionForApprovalResult,
  TransactionApprovalSigningMode,
  TransactionApprovalSponsorshipFacts,
} from './prepare-transaction-for-approval.js';
import { prepareTransactionForApproval } from './prepare-transaction-for-approval.js';

type SponsorshipFactsRow = [
  available: boolean,
  supported: boolean,
  optedOut: boolean,
  required: boolean,
  externalSigningSupported: boolean,
];

type SuccessfulTruthTableRow = [
  ...SponsorshipFactsRow,
  expectedSponsorship: boolean,
  expectedSigningMode: TransactionApprovalSigningMode,
];

const SUCCESSFUL_TRUTH_TABLE: SuccessfulTruthTableRow[] = [
  [false, false, false, false, false, false, 'local'],
  [false, false, false, false, true, false, 'local'],
  [false, false, true, false, false, false, 'local'],
  [false, false, true, false, true, false, 'local'],
  [false, false, true, true, false, false, 'local'],
  [false, false, true, true, true, false, 'local'],
  [false, true, false, false, false, false, 'local'],
  [false, true, false, false, true, false, 'local'],
  [false, true, true, false, false, false, 'local'],
  [false, true, true, false, true, false, 'local'],
  [false, true, true, true, false, false, 'local'],
  [false, true, true, true, true, false, 'local'],
  [true, false, false, false, false, false, 'local'],
  [true, false, false, false, true, false, 'local'],
  [true, false, false, true, true, true, 'external'],
  [true, false, true, false, false, false, 'local'],
  [true, false, true, false, true, false, 'local'],
  [true, false, true, true, false, false, 'local'],
  [true, false, true, true, true, false, 'local'],
  [true, true, false, false, false, true, 'local'],
  [true, true, false, false, true, true, 'external'],
  [true, true, false, true, false, true, 'local'],
  [true, true, false, true, true, true, 'external'],
  [true, true, true, false, false, false, 'local'],
  [true, true, true, false, true, false, 'local'],
  [true, true, true, true, false, false, 'local'],
  [true, true, true, true, true, false, 'local'],
];

const ERROR_TRUTH_TABLE: SponsorshipFactsRow[] = [
  [false, false, false, true, false],
  [false, false, false, true, true],
  [false, true, false, true, false],
  [false, true, false, true, true],
  [true, false, false, true, false],
];

const TRANSACTION_META: TransactionMeta = {
  chainId: '0x1',
  id: 'transaction-id',
  isExternalSign: true,
  isGasFeeSponsored: true,
  networkClientId: 'mainnet',
  origin: 'https://example.test',
  selectedGasFeeToken: '0x1234',
  status: TransactionStatus.unapproved,
  time: 123,
  txParams: {
    data: '0x5678',
    from: '0xfrom',
    nonce: '0x1',
    to: '0xto',
  },
};

function prepare(
  transactionMeta: TransactionMeta,
  sponsorship: TransactionApprovalSponsorshipFacts,
  externalSigningSupported: boolean,
): PrepareTransactionForApprovalResult {
  return prepareTransactionForApproval({
    signing: { externalSigningSupported },
    sponsorship,
    transactionMeta,
  });
}

describe('prepareTransactionForApproval', () => {
  it.each(SUCCESSFUL_TRUTH_TABLE)(
    'normalizes available=%s supported=%s optedOut=%s required=%s externalSigningSupported=%s',
    (
      available,
      supported,
      optedOut,
      required,
      externalSigningSupported,
      expectedSponsorship,
      expectedSigningMode,
    ) => {
      const result = prepare(
        TRANSACTION_META,
        { available, supported, optedOut, required },
        externalSigningSupported,
      );

      expect(result).toStrictEqual({
        decisions: {
          signingMode: expectedSigningMode,
          sponsorshipEnabled: expectedSponsorship,
        },
        transactionMeta: {
          ...TRANSACTION_META,
          isExternalSign: expectedSigningMode === 'external',
          isGasFeeSponsored: expectedSponsorship,
        },
      });
    },
  );

  it.each(ERROR_TRUTH_TABLE)(
    'rejects unavailable required sponsorship with available=%s supported=%s optedOut=%s required=%s externalSigningSupported=%s',
    (available, supported, optedOut, required, externalSigningSupported) => {
      const prepareTransaction = (): PrepareTransactionForApprovalResult =>
        prepare(
          TRANSACTION_META,
          { available, supported, optedOut, required },
          externalSigningSupported,
        );

      expect(prepareTransaction).toThrow(
        'Required transaction sponsorship is unavailable',
      );
    },
  );

  it('preserves unrelated metadata without mutating the input', () => {
    const input = cloneDeep(TRANSACTION_META);
    const inputBeforePreparation = cloneDeep(input);

    const result = prepare(
      input,
      {
        available: true,
        supported: false,
        optedOut: false,
        required: false,
      },
      false,
    );

    expect(input).toStrictEqual(inputBeforePreparation);
    expect(result.transactionMeta).not.toBe(input);
    expect(result.transactionMeta).toMatchObject({
      origin: input.origin,
      selectedGasFeeToken: input.selectedGasFeeToken,
      txParams: input.txParams,
    });
    expect(result.transactionMeta.isGasFeeSponsored).toBe(false);
    expect(result.transactionMeta.isExternalSign).toBe(false);
  });

  it('is idempotent', () => {
    const request = {
      signing: { externalSigningSupported: true },
      sponsorship: {
        available: true,
        supported: true,
        optedOut: false,
        required: false,
      },
      transactionMeta: TRANSACTION_META,
    };
    const firstResult = prepareTransactionForApproval(request);
    const secondResult = prepareTransactionForApproval({
      ...request,
      transactionMeta: firstResult.transactionMeta,
    });

    expect(secondResult).toStrictEqual(firstResult);
  });
});
