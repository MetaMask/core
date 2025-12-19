import type { Json } from '@metamask/utils';
import { sha256, bytesToHex } from '@metamask/utils';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

import type { FeatureFlagScopeValue } from '../remote-feature-flag-controller-types';

/**
 * Converts a UUID string to a BigInt by removing dashes and converting to hexadecimal.
 *
 * @param uuid - The UUID string to convert
 * @returns The UUID as a BigInt value
 */
function uuidStringToBigInt(uuid: string): bigint {
  return BigInt(`0x${uuid.replace(/-/gu, '')}`);
}

const MIN_UUID_V4 = '00000000-0000-4000-8000-000000000000';
const MAX_UUID_V4 = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
const MIN_UUID_V4_BIGINT = uuidStringToBigInt(MIN_UUID_V4);
const MAX_UUID_V4_BIGINT = uuidStringToBigInt(MAX_UUID_V4);
const UUID_V4_VALUE_RANGE_BIGINT = MAX_UUID_V4_BIGINT - MIN_UUID_V4_BIGINT;

/**
 * Calculates a deterministic threshold value between 0 and 1 for A/B testing.
 * This function hashes the user's MetaMetrics ID combined with the feature flag name
 * to ensure consistent group assignment across sessions while varying across different flags.
 *
 * @param metaMetricsId - The user's MetaMetrics ID (must be non-empty)
 * @param featureFlagName - The feature flag name to create unique threshold per flag
 * @returns A promise that resolves to a number between 0 and 1
 * @throws Error if metaMetricsId is empty
 */
export async function calculateThresholdForFlag(
  metaMetricsId: string,
  featureFlagName: string,
): Promise<number> {
  if (!metaMetricsId) {
    throw new Error('MetaMetrics ID cannot be empty');
  }

  if (!featureFlagName) {
    throw new Error('Feature flag name cannot be empty');
  }

  const normalizedFlagName = featureFlagName.toLowerCase();
  const seed = metaMetricsId + normalizedFlagName;

  // Hash the combined seed
  const encoder = new TextEncoder();
  const hashBuffer = await sha256(encoder.encode(seed));

  // Convert hash bytes directly to 0-1 range
  const hash = bytesToHex(hashBuffer);
  const hashBigInt = BigInt(hash);
  const maxValue = BigInt(`0x${'f'.repeat(64)}`);

  // Use BigInt division first, then convert to number to maintain precision
  return Number((hashBigInt * BigInt(1_000_000)) / maxValue) / 1_000_000;
}

/**
 * Generates a deterministic random number between 0 and 1 based on a metaMetricsId.
 * This is useful for A/B testing and feature flag rollouts where we want
 * consistent group assignment for the same user.
 *
 * @param metaMetricsId - The unique identifier used to generate the deterministic random number. Must be either:
 * - A UUIDv4 string (e.g., '123e4567-e89b-12d3-a456-426614174000'
 * - A hex string with '0x' prefix (e.g., '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d136420')
 * @returns A number between 0 and 1, deterministically generated from the input ID.
 * The same input will always produce the same output.
 */
export function generateDeterministicRandomNumber(
  metaMetricsId: string,
): number {
  if (!metaMetricsId) {
    throw new Error('MetaMetrics ID cannot be empty');
  }

  let idValue: bigint;
  let maxValue: bigint;

  // uuidv4 format
  if (uuidValidate(metaMetricsId)) {
    if (uuidVersion(metaMetricsId) !== 4) {
      throw new Error(
        `Invalid UUID version. Expected v4, got v${uuidVersion(metaMetricsId)}`,
      );
    }
    idValue = uuidStringToBigInt(metaMetricsId) - MIN_UUID_V4_BIGINT;
    maxValue = UUID_V4_VALUE_RANGE_BIGINT;
  } else {
    // hex format with 0x prefix
    if (!metaMetricsId.startsWith('0x')) {
      throw new Error('Hex ID must start with 0x prefix');
    }

    const cleanId = metaMetricsId.slice(2);
    const EXPECTED_HEX_LENGTH = 64; // 32 bytes = 64 hex characters

    if (cleanId.length !== EXPECTED_HEX_LENGTH) {
      throw new Error(
        `Invalid hex ID length. Expected ${EXPECTED_HEX_LENGTH} characters, got ${cleanId.length}`,
      );
    }

    if (!/^[0-9a-f]+$/iu.test(cleanId)) {
      throw new Error('Hex ID contains invalid characters');
    }

    idValue = BigInt(`0x${cleanId}`);
    maxValue = BigInt(`0x${'f'.repeat(cleanId.length)}`);
  }

  // Use BigInt division first, then convert to number to maintain precision
  return Number((idValue * BigInt(1_000_000)) / maxValue) / 1_000_000;
}

/**
 * Type guard to check if a value is a feature flag with scope.
 * Used to validate feature flag objects that contain scope-based configurations.
 *
 * @param featureFlag - The value to check if it's a feature flag with scope
 * @returns True if the value is a feature flag with scope, false otherwise
 */
export const isFeatureFlagWithScopeValue = (
  featureFlag: Json,
): featureFlag is FeatureFlagScopeValue => {
  return (
    typeof featureFlag === 'object' &&
    featureFlag !== null &&
    'scope' in featureFlag
  );
};
