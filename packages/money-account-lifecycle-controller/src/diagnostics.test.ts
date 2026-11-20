import { ChompApiError } from '@metamask/chomp-api-service';
import { describe, it, expect } from 'vitest';

import {
  MIGRATING_IDENTITY,
  MFA_IDENTITY,
  SFA_IDENTITY,
} from '../tests/helpers.js';
import {
  buildLifecycleChangedEvent,
  isKeptInHistory,
  summarizeError,
} from './diagnostics.js';
import {
  MoneyAccountLifecycleError,
  MoneyAccountLifecycleErrorCode,
} from './errors.js';

describe('summarizeError', () => {
  it('keeps the name and message of an error', () => {
    expect(summarizeError(new TypeError('Something broke'))).toStrictEqual({
      name: 'TypeError',
      message: 'Something broke',
      code: null,
      httpStatus: null,
      step: null,
    });
  });

  it('keeps the code and HTTP status of a CHOMP error', () => {
    expect(
      summarizeError(new ChompApiError(409, 'Conflict', 'MIGRATION_CONFLICT')),
    ).toStrictEqual({
      name: 'ChompApiError',
      message: 'Conflict',
      code: 'MIGRATION_CONFLICT',
      httpStatus: 409,
      step: null,
    });
  });

  it('keeps the code of a lifecycle error', () => {
    expect(
      summarizeError(
        new MoneyAccountLifecycleError(
          MoneyAccountLifecycleErrorCode.NotMigratable,
          'Not migratable',
        ),
      ),
    ).toMatchObject({
      name: 'MoneyAccountLifecycleError',
      code: 'NOT_MIGRATABLE',
    });
  });

  it('keeps the step of a failed upgrade', () => {
    const error = Object.assign(new Error('Upgrade failed'), {
      name: 'MoneyAccountUpgradeStepError',
      step: 'sign-delegation',
    });

    expect(summarizeError(error)).toMatchObject({
      name: 'MoneyAccountUpgradeStepError',
      step: 'sign-delegation',
    });
  });

  it('ignores a code, HTTP status or step of the wrong type', () => {
    const error = Object.assign(new Error('Odd'), {
      code: 42,
      httpStatus: '500',
      step: {},
    });

    expect(summarizeError(error)).toMatchObject({
      code: null,
      httpStatus: null,
      step: null,
    });
  });

  it('summarises a value that is not an error', () => {
    expect(summarizeError('Chomp is down')).toStrictEqual({
      name: 'Error',
      message: 'Chomp is down',
      code: null,
      httpStatus: null,
      step: null,
    });
  });

  it('redacts addresses and longer hex values from the message', () => {
    const address = '0x00000000000000000000000000000000000000Aa';
    const hash = `0x${'ab'.repeat(32)}`;

    expect(
      summarizeError(new Error(`Account ${address} signed ${hash} at 0x8f`))
        .message,
    ).toBe('Account 0x[redacted] signed 0x[redacted] at 0x8f');
  });

  it('truncates a long message', () => {
    const { message } = summarizeError(new Error('a'.repeat(1000)));

    expect(message).toBe(`${'a'.repeat(300)}…`);
  });
});

describe('buildLifecycleChangedEvent', () => {
  it('describes the first lifecycle recorded for a money account', () => {
    expect(
      buildLifecycleChangedEvent(undefined, { type: 'notInIdentity' }),
    ).toStrictEqual({
      type: 'lifecycleChanged',
      from: null,
      to: 'notInIdentity',
      identityStatus: null,
      migration: null,
    });
  });

  it('describes a change between lifecycles', () => {
    expect(
      buildLifecycleChangedEvent(
        { type: 'sfa', identity: SFA_IDENTITY },
        { type: 'mfa', identity: MFA_IDENTITY },
      ),
    ).toStrictEqual({
      type: 'lifecycleChanged',
      from: 'sfa',
      to: 'mfa',
      identityStatus: 'DONE',
      migration: null,
    });
  });

  it('describes the progress of a migration without its addresses', () => {
    const event = buildLifecycleChangedEvent(
      { type: 'sfa', identity: SFA_IDENTITY },
      {
        type: 'migrating',
        identity: {
          ...MIGRATING_IDENTITY,
          migration: {
            ...MIGRATING_IDENTITY.migration,
            transfer: { requestId: 'transfer-request-id', status: 'PENDING' },
            premiumTransfer: {
              requestId: 'premium-request-id',
              status: 'COMPLETED',
            },
          },
        },
      },
    );

    expect(event).toStrictEqual({
      type: 'lifecycleChanged',
      from: 'sfa',
      to: 'migrating',
      identityStatus: 'MIGRATING',
      migration: {
        steps: MIGRATING_IDENTITY.migration.steps,
        transferStatus: 'PENDING',
        premiumTransferStatus: 'COMPLETED',
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/0x|request-id/u);
  });
});

describe('isKeptInHistory', () => {
  it.each([
    'upgradeSkipped',
    'upgradeStarted',
    'upgradeSucceeded',
    'upgradeFailed',
  ] as const)('keeps %s out of the history', (type) => {
    expect(isKeptInHistory({ type } as never)).toBe(false);
  });

  it.each([
    'identitiesFetchSucceeding',
    'identitiesFetchFailing',
    'registrationStatusFetchFailed',
    'lifecycleChanged',
    'registrationStatusChanged',
    'mpcMoneyAccountSetAsDefault',
    'migrationStarted',
    'migrationStageStarted',
    'fundsTransferRetried',
    'migrationSucceeded',
    'migrationFailed',
    'stateCleared',
    'unexpectedError',
  ] as const)('keeps %s in the history', (type) => {
    expect(isKeptInHistory({ type } as never)).toBe(true);
  });
});
