import { assert } from '@metamask/type-utils';

import { BIP44CoinTypeNode } from './BIP44CoinTypeNode.js';
import { BIP44Node } from './BIP44Node.js';
import type { Network, SLIP10Path } from './constants.js';
import {
  BIP_32_PATH_REGEX,
  BIP_39_PATH_REGEX,
  MIN_BIP_44_DEPTH,
  SLIP_10_PATH_REGEX,
  CIP_3_PATH_REGEX,
} from './constants.js';
import type { CryptographicFunctions } from './cryptography.js';
import type { SupportedCurve } from './curves/index.js';
import { getCurveByName } from './curves/index.js';
import type { Deriver } from './derivers/index.js';
import { derivers } from './derivers/index.js';
import { SLIP10Node } from './SLIP10Node.js';

/**
 * Ethereum default seed path: "m/44'/60'/0'/0/{account_index}"
 * Multipath: "bip32:44'/bip32:60'/bip32:0'/bip32:0/bip32:{account_index}"
 *
 * m: { privateKey, chainCode } = sha512Hmac("Bitcoin seed", masterSeed)
 * 44': { privateKey, chainCode } = parentKey.privateKey + sha512Hmac(parentKey.chainCode, [0x00, parentKey.privateKey, index + HARDENED_OFFSET])
 * 60': { privateKey, chainCode } = parentKey.privateKey + sha512Hmac(parentKey.chainCode, [0x00, parentKey.privateKey, index + HARDENED_OFFSET])
 * 0': { privateKey, chainCode } = parentKey.privateKey + sha512Hmac(parentKey.chainCode, [0x00, parentKey.privateKey, index + HARDENED_OFFSET])
 * 0: { privateKey, chainCode } = parentKey.privateKey + sha512Hmac(parentKey.chainCode, [parentKey.publicKey, index])
 * 0: { privateKey, chainCode } = parentKey.privateKey + sha512Hmac(parentKey.chainCode, [parentKey.publicKey, index])
 */

type BaseDeriveKeyFromPathArgs = {
  path: SLIP10Path;
  depth?: number;
};

type DeriveKeyFromPathNodeArgs = BaseDeriveKeyFromPathArgs & {
  node?: SLIP10Node | BIP44Node | BIP44CoinTypeNode;
};

type DeriveKeyFromPathCurveArgs = BaseDeriveKeyFromPathArgs & {
  network?: Network | undefined;
  curve: SupportedCurve;
};

type DeriveKeyFromPathArgs =
  | DeriveKeyFromPathNodeArgs
  | DeriveKeyFromPathCurveArgs;

/**
 * Takes a full or partial HD path string and returns the key corresponding to
 * the given path, with the following constraints:
 *
 * - If the path starts with a BIP-32 node, a parent key must be provided.
 * - If the path starts with a BIP-39 node, a parent key must NOT be provided.
 * - The path cannot exceed 5 BIP-32 nodes in length, optionally preceded by
 * a single BIP-39 node.
 *
 * WARNING: It is the consumer's responsibility to ensure that the path is valid
 * relative to its parent key.
 *
 * @param args - The arguments for deriving a key from a path.
 * @param args.path - A full or partial HD path, e.g.:
 * `bip39:SEED_PHRASE/bip32:44'/bip32:60'/bip32:0'/bip32:0/bip32:0`.
 * BIP-39 seed phrases must be lowercase, space-delimited, and 12-24 words long.
 * @param args.node - The node to derive from.
 * @param args.depth - The depth of the segment.
 * @param cryptographicFunctions - The cryptographic functions to use. If
 * provided, these will be used instead of the built-in implementations.
 * @returns The derived key.
 */
export async function deriveKeyFromPath(
  args: DeriveKeyFromPathArgs,
  cryptographicFunctions?: CryptographicFunctions,
): Promise<SLIP10Node> {
  const { path, depth = path.length } = args;

  const node = 'node' in args ? args.node : undefined;
  const network = 'network' in args ? args.network : node?.network;
  const curve = 'curve' in args ? args.curve : node?.curve;

  if (
    node &&
    !(node instanceof SLIP10Node) &&
    !(node instanceof BIP44Node) &&
    !(node instanceof BIP44CoinTypeNode)
  ) {
    throw new Error(
      'Invalid arguments: Node must be a SLIP-10 node or a BIP-44 node when provided.',
    );
  }

  if (!curve) {
    throw new Error(
      'Invalid arguments: Must specify either a parent node or curve.',
    );
  }

  validatePathSegment(
    path,
    Boolean(node?.privateKey) || Boolean(node?.publicKey),
    depth,
  );

  // Derive through each part of path. `pathSegment` needs to be cast because
  // `HDPathTuple.reduce()` doesn't work. Note that the first element of the
  // path can be a Uint8Array.
  return await (path as readonly [Uint8Array | string, ...string[]]).reduce<
    Promise<SLIP10Node>
  >(
    async (promise, pathNode, index) => {
      const derivedNode = await promise;

      if (typeof pathNode === 'string') {
        const [pathType, pathPart] = pathNode.split(':');

        assert(pathType);
        assert(pathPart);
        assert(hasDeriver(pathType), `Unknown derivation type: "${pathType}".`);

        const deriver = derivers[pathType] as Deriver;
        return await deriver.deriveChildKey(
          {
            path: pathPart,
            node: derivedNode,
            curve: getCurveByName(curve),
            network,
          },
          cryptographicFunctions,
        );
      }

      // Only the first path segment can be a Uint8Array.
      assert(index === 0, getMalformedError());

      return await derivers.bip39.deriveChildKey(
        {
          path: pathNode,
          node: derivedNode,
          curve: getCurveByName(curve),
          network,
        },
        cryptographicFunctions,
      );
    },
    Promise.resolve(node as SLIP10Node),
  );
}

/**
 * Check if the given path type is a valid deriver.
 *
 * @param pathType - The path type to check.
 * @returns Whether the path type is a valid deriver.
 */
function hasDeriver(pathType: string): pathType is keyof typeof derivers {
  return pathType in derivers;
}

/**
 * The path segment must be one of the following:
 * - A lone BIP-32 path node.
 * - A lone BIP-39 path node.
 * - A multipath.
 *
 * @param path - The path segment string to validate.
 * @param hasKey - Whether the path segment has a key.
 * @param depth - The depth of the segment.
 */
export function validatePathSegment(
  path: SLIP10Path,
  hasKey: boolean,
  depth?: number,
): void {
  if ((path as readonly unknown[]).length === 0) {
    throw new Error(`Invalid HD path segment: The segment must not be empty.`);
  }

  let startsWithBip39 = false;
  path.forEach((node, index) => {
    if (index === 0) {
      startsWithBip39 =
        node instanceof Uint8Array || BIP_39_PATH_REGEX.test(node);

      if (
        // TypeScript is unable to infer that `node` is a string here, so we
        // need to explicitly check it again.
        !(node instanceof Uint8Array) &&
        !startsWithBip39 &&
        !BIP_32_PATH_REGEX.test(node) &&
        !SLIP_10_PATH_REGEX.test(node) &&
        !CIP_3_PATH_REGEX.test(node)
      ) {
        throw getMalformedError();
      }
    } else if (
      node instanceof Uint8Array ||
      (!BIP_32_PATH_REGEX.test(node) &&
        !SLIP_10_PATH_REGEX.test(node) &&
        !CIP_3_PATH_REGEX.test(node))
    ) {
      throw getMalformedError();
    }
  });

  if (depth === MIN_BIP_44_DEPTH && (!startsWithBip39 || path.length !== 1)) {
    throw new Error(
      `Invalid HD path segment: The segment must consist of a single BIP-39 node for depths of ${MIN_BIP_44_DEPTH}. Received: "${String(
        path,
      )}".`,
    );
  }

  if (!hasKey && !startsWithBip39) {
    throw new Error(
      'Invalid derivation parameters: Must specify parent key if the first node of the path segment is not a BIP-39 node.',
    );
  }

  if (hasKey && startsWithBip39) {
    throw new Error(
      'Invalid derivation parameters: May not specify parent key if the path segment starts with a BIP-39 node.',
    );
  }

  const pathWithoutKey = (startsWithBip39 ? path.slice(1) : path) as string[];
  if (pathWithoutKey.length > 0) {
    const firstSegmentType = pathWithoutKey[0]?.split(':')[0];
    assert(firstSegmentType);
    assert(
      pathWithoutKey.every((segment) =>
        segment.startsWith(`${firstSegmentType}:`),
      ),
      `Invalid HD path segment: Cannot mix 'bip32' and 'slip10' path segments.`,
    );
  }
}

/**
 * Get the error for a malformed path segment.
 *
 * @returns The error.
 */
function getMalformedError(): Error {
  return new Error('Invalid HD path segment: The path segment is malformed.');
}
