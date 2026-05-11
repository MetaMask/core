import { isValidHexAddress } from '@metamask/controller-utils';

import type { SimilarAddressMatch, SimilarityOptions } from './types';

const DEFAULT_PREFIX_LEN = 4;
const DEFAULT_SUFFIX_LEN = 4;

function normalizeAddress(address: string): string | null {
  if (!isValidHexAddress(address, { allowNonPrefixed: false })) {
    return null;
  }

  return address.toLowerCase();
}

function getPrefixMatchLength(candidate: string, knownAddress: string): number {
  let index = 0;

  while (index < candidate.length && candidate[index] === knownAddress[index]) {
    index += 1;
  }

  return index;
}

function getSuffixMatchLength(candidate: string, knownAddress: string): number {
  let index = 0;

  while (
    index < candidate.length &&
    candidate[candidate.length - 1 - index] ===
      knownAddress[knownAddress.length - 1 - index]
  ) {
    index += 1;
  }

  return index;
}

function getDiffIndices(candidate: string, knownAddress: string): number[] {
  const diffIndices: number[] = [];

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== knownAddress[index]) {
      diffIndices.push(index + 2);
    }
  }

  return diffIndices;
}

export function findSimilarAddresses(
  candidate: string,
  knownAddresses: string[],
  options: SimilarityOptions = {},
): SimilarAddressMatch[] {
  const normalizedCandidate = normalizeAddress(candidate);

  if (!normalizedCandidate) {
    return [];
  }

  const prefixLen = options.prefixLen ?? DEFAULT_PREFIX_LEN;
  const suffixLen = options.suffixLen ?? DEFAULT_SUFFIX_LEN;
  const candidateBody = normalizedCandidate.slice(2);

  return knownAddresses
    .map((knownAddress) => {
      const normalizedKnownAddress = normalizeAddress(knownAddress);

      if (
        normalizedKnownAddress?.length !== normalizedCandidate.length ||
        normalizedKnownAddress === normalizedCandidate
      ) {
        return null;
      }

      const knownAddressBody = normalizedKnownAddress.slice(2);
      const prefixMatchLength = getPrefixMatchLength(
        candidateBody,
        knownAddressBody,
      );
      const suffixMatchLength = getSuffixMatchLength(
        candidateBody,
        knownAddressBody,
      );

      if (prefixMatchLength < prefixLen || suffixMatchLength < suffixLen) {
        return null;
      }

      return {
        knownAddress,
        prefixMatchLength,
        suffixMatchLength,
        poisoningScore: prefixMatchLength + suffixMatchLength,
        diffIndices: getDiffIndices(candidateBody, knownAddressBody),
      };
    })
    .filter((match): match is SimilarAddressMatch => Boolean(match))
    .sort((left, right) => right.poisoningScore - left.poisoningScore);
}
