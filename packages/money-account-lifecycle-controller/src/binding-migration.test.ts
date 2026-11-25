import { describe, expect, it } from 'vitest';

import {
  BindingMigrationIncompleteError,
  buildBindingMigrationContext,
  getBindingMigrationId,
} from './binding-migration.js';

const PREVIOUS_ADDRESS = '0x00000000000000000000000000000000000000Aa';
const CURRENT_ADDRESS = '0x00000000000000000000000000000000000000Dd';
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
