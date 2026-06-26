import type {
  Caveat,
  PermissionConstraint,
} from '@metamask/permission-controller';
import { SnapCaveatType } from '@metamask/snaps-utils';

// TODO: this is a duplicate of https://github.com/MetaMask/snaps/blob/362208e725db18baed550ade99087d44e7b537ed/packages/snaps-rpc-methods/src/endowments/name-lookup.ts#L151
// To be removed once core has snaps-rpc-methods dependency
/**
 * Getter function to get the chainIds caveat from a permission.
 *
 * This does basic validation of the caveat, but does not validate the type or
 * value of the namespaces object itself, as this is handled by the
 * `PermissionsController` when the permission is requested.
 *
 * @param permission - The permission to get the `chainIds` caveat from.
 * @returns An array of `chainIds` that the snap supports.
 */
// istanbul ignore next
export function getChainIdsCaveat(
  permission?: PermissionConstraint,
): string[] | null {
  if (!permission?.caveats) {
    return null;
  }

  const caveat = permission.caveats.find(
    (permCaveat) => permCaveat.type === SnapCaveatType.ChainIds,
  ) as Caveat<string, string[]> | undefined;

  return caveat ? caveat.value : null;
}
