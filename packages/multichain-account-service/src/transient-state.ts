import type {
  StateConstraint,
  StatePropertyMetadata,
} from '@metamask/base-controller';

/**
 * Transient state metadata.
 *
 * This metadata describes how to get an anonymized representation of the state.
 */
export type TransientStateMetadata<T extends StateConstraint> = {
  [P in keyof T]-?: StatePropertyMetadata<T[P]> & {
    // Since the state is transient, it cannot be persisted.
    persist: false;
  };
};
