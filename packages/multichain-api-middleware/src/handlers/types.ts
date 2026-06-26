import {
  Caip25CaveatType,
  Caip25CaveatValue,
} from '@metamask/chain-agnostic-permission';
import type {
  GenericPermissionController,
  Caveat,
} from '@metamask/permission-controller';
import type { MultichainRoutingService } from '@metamask/snaps-controllers';
import type { CaipAccountId } from '@metamask/utils';

/**
 * Multichain API notifications currently supported by/known to the wallet.
 */
export enum MultichainApiNotifications {
  sessionChanged = 'wallet_sessionChanged',
  walletNotify = 'wallet_notify',
}

export type Caip25Caveat = Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;

export type GetCaveatForOriginHook = {
  getCaveatForOrigin: (
    endowmentPermissionName: string,
    caveatType: string,
  ) => ReturnType<GenericPermissionController['getCaveat']>;
};

export type GetNonEvmSupportedMethodsHook = {
  getNonEvmSupportedMethods: MultichainRoutingService['getSupportedMethods'];
};

export type SortAccountIdsByLastSelectedHook = {
  sortAccountIdsByLastSelected: (accounts: CaipAccountId[]) => CaipAccountId[];
};
