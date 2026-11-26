import type {
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  BindingMigrationIncompleteError,
  buildBindingMigrationContext,
  getBindingMigrationId,
  getRunnableBindingMigrationPhases,
  sanitizeBindingMigrationResult,
  sanitizeBindingMigratorStatus,
} from './binding-migration.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';

const PREVIOUS_ADDRESS: Hex = '0x00000000000000000000000000000000000000Aa';
const CURRENT_ADDRESS: Hex = '0x00000000000000000000000000000000000000Dd';
const MIGRATION_ID =
  '0xf4bd66b23233da5810ca057e3d75295a14fe6f0db0e4f54e41477a5de84464bc';

describe('getBindingMigrationId', () => {
  it('derives the keccak256 hash of the lowercased previous and current addresses', () => {
    expect(getBindingMigrationId(PREVIOUS_ADDRESS, CURRENT_ADDRESS)).toBe(
      MIGRATION_ID,
    );
  });

  it('does not depend on address casing', () => {
    expect(
      getBindingMigrationId(
        PREVIOUS_ADDRESS.toUpperCase().replace('0X', '0x'),
        CURRENT_ADDRESS.toLowerCase(),
      ),
    ).toBe(MIGRATION_ID);
  });

  it('depends on the direction of the migration', () => {
    expect(getBindingMigrationId(CURRENT_ADDRESS, PREVIOUS_ADDRESS)).not.toBe(
      MIGRATION_ID,
    );
  });
});

describe('buildBindingMigrationContext', () => {
  it('builds the context with lowercased addresses and the migration id', () => {
    expect(
      buildBindingMigrationContext(PREVIOUS_ADDRESS, CURRENT_ADDRESS, 'DONE'),
    ).toStrictEqual({
      migrationId: MIGRATION_ID,
      previousAddress: PREVIOUS_ADDRESS.toLowerCase(),
      currentAddress: CURRENT_ADDRESS.toLowerCase(),
      identityStatus: 'DONE',
    });
  });
});

describe('BindingMigrationIncompleteError', () => {
  it('names the phase and every incomplete migrator', () => {
    const error = new BindingMigrationIncompleteError('afterLink', [
      { migratorId: 'vba', result: { status: 'pending', reason: 'Busy' } },
      { migratorId: 'card', result: { status: 'blocked', reason: 'Denied' } },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('BindingMigrationIncompleteError');
    expect(error.phase).toBe('afterLink');
    expect(error.migrations).toStrictEqual([
      { migratorId: 'vba', result: { status: 'pending', reason: 'Busy' } },
      { migratorId: 'card', result: { status: 'blocked', reason: 'Denied' } },
    ]);
    expect(error.message).toBe(
      "Binding migrations did not complete in the 'afterLink' phase: vba (pending: Busy), card (blocked: Denied)",
    );
  });
});

describe('getRunnableBindingMigrationPhases', () => {
  const migration: DerivedIdentityMigration = {
    from: PREVIOUS_ADDRESS,
    to: CURRENT_ADDRESS,
    steps: [],
    transfer: null,
    premiumTransfer: null,
  };
  const identity: DerivedIdentity = {
    currentAddress: PREVIOUS_ADDRESS,
    previousAddresses: [],
    status: 'MIGRATING',
    migration,
  };
  const transfer = { requestId: 'request-id', status: 'PENDING' };

  it.each<[string, MoneyAccountLifecycle | undefined]>([
    ['no lifecycle', undefined],
    ['not in an identity', { type: 'notInIdentity' }],
    ['a valid SFA', { type: 'sfa', identity }],
    [
      'migrating before the funds transfer starts',
      { type: 'migrating', identity },
    ],
  ])('runs every phase for %s', (_description, lifecycle) => {
    expect(getRunnableBindingMigrationPhases(lifecycle)).toStrictEqual([
      'afterLink',
      'beforeFundsTransfer',
      'afterDone',
    ]);
  });

  it.each<[string, MoneyAccountLifecycle]>([
    [
      'the funds transfer',
      {
        type: 'migrating',
        identity: {
          ...identity,
          migration: { ...migration, transfer },
        },
      },
    ],
    [
      'the premium funds transfer',
      {
        type: 'migrating',
        identity: {
          ...identity,
          migration: { ...migration, premiumTransfer: transfer },
        },
      },
    ],
  ])('only runs afterDone once %s has started', (_description, lifecycle) => {
    expect(getRunnableBindingMigrationPhases(lifecycle)).toStrictEqual([
      'afterDone',
    ]);
  });

  it('only runs afterDone for a valid MFA', () => {
    expect(
      getRunnableBindingMigrationPhases({
        type: 'mfa',
        identity: { ...identity, status: 'DONE', migration: null },
      }),
    ).toStrictEqual(['afterDone']);
  });
});

describe('sanitizeBindingMigrationResult', () => {
  it.each([
    { status: 'not_required' },
    { status: 'completed' },
    { status: 'pending', reason: 'Busy' },
    { status: 'blocked', reason: 'Denied' },
  ])('keeps the valid result %o', (result) => {
    expect(sanitizeBindingMigrationResult(result)).toStrictEqual(result);
  });

  it('drops fields that are not part of the result', () => {
    expect(
      sanitizeBindingMigrationResult({
        status: 'completed',
        signature: '0xdeadbeef',
      }),
    ).toStrictEqual({ status: 'completed' });
  });

  it.each([
    undefined,
    null,
    'completed',
    { status: 'failed' },
    { status: 'Pending', reason: 'Busy' },
    { status: 'pending' },
    { status: 'blocked', reason: 1 },
  ])('rejects %o', (value) => {
    expect(sanitizeBindingMigrationResult(value)).toBeUndefined();
  });
});

describe('sanitizeBindingMigratorStatus', () => {
  it('copies the details, so the migrator keeps ownership of its objects', () => {
    const details = { step: 1 };

    const status = sanitizeBindingMigratorStatus({
      status: 'pending',
      details,
    });

    expect(status).toStrictEqual({ status: 'pending', details: { step: 1 } });
    expect(status?.details).not.toBe(details);
  });

  it('records missing details as null and drops other fields', () => {
    expect(
      sanitizeBindingMigratorStatus({ status: 'unknown', extra: true }),
    ).toStrictEqual({ status: 'unknown', details: null });
  });

  it.each([
    undefined,
    null,
    { status: 'failed' },
    { status: 'pending', details: { callback: (): void => undefined } },
    { status: 'pending', details: { value: undefined } },
  ])('rejects %o', (value) => {
    expect(sanitizeBindingMigratorStatus(value)).toBeUndefined();
  });
});
