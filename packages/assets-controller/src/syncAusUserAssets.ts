import type {
  AuthenticatedUserStorageServiceHideTokensAction,
  AuthenticatedUserStorageServiceImportTokensAction,
  UserAssetsBlob,
} from '@metamask/authenticated-user-storage';

import type { AssetsControllerMessenger } from './AssetsController.js';
import { projectLogger, createModuleLogger } from './logger.js';
import type { Caip19AssetId } from './types.js';
import { normalizeAssetId } from './utils/index.js';

const log = createModuleLogger(projectLogger, 'syncAusUserAssets');

/** The list of a user-assets blob an asset can be stripped from. */
type StripFromList = 'importedAssets' | 'hiddenAssets';

/** Merge configuration: a single high-level AUS SDK operation. */
type MergeConfig = {
  kind: 'merge';
  action:
    | AuthenticatedUserStorageServiceImportTokensAction['type']
    | AuthenticatedUserStorageServiceHideTokensAction['type'];
  assetIdArgIndex: number;
};

/** Strip configuration: remove from one blob list, leaving the other untouched. */
type StripConfig = {
  kind: 'strip';
  stripFrom: StripFromList;
  assetIdArgIndex: number;
};

type AusSyncConfig = MergeConfig | StripConfig;

/**
 * The controller surface the AUS sync needs. `messenger` is spelled out here
 * because it is protected on the controller and so cannot be picked.
 */
type AusSyncCaller = {
  messenger: Pick<AssetsControllerMessenger, 'call'>;
};

/**
 * The decorated methods and the AUS user-assets behavior each one mirrors.
 */
const AUS_SYNC_METHODS = {
  addCustomAsset: {
    kind: 'merge',
    action: 'AuthenticatedUserStorageService:importTokens',
    assetIdArgIndex: 1,
  },
  removeCustomAsset: {
    kind: 'strip',
    stripFrom: 'importedAssets',
    assetIdArgIndex: 1,
  },
  hideAsset: {
    kind: 'merge',
    action: 'AuthenticatedUserStorageService:hideTokens',
    assetIdArgIndex: 0,
  },
  unhideAsset: {
    kind: 'strip',
    stripFrom: 'hiddenAssets',
    assetIdArgIndex: 0,
  },
} as const satisfies Record<string, AusSyncConfig>;

/**
 * Mirror a custom-token action to AUS user assets.
 *
 * @param caller - The controller whose messenger to call AUS actions on.
 * @param config - The AUS behavior configured for the invoked method.
 * @param assetId - The CAIP-19 asset ID the method was invoked with.
 */
async function syncUserAssetsToAus(
  caller: AusSyncCaller,
  config: AusSyncConfig,
  assetId: Caip19AssetId,
): Promise<void> {
  const normalizedAssetId = normalizeAssetId(assetId);

  if (config.kind === 'merge') {
    await caller.messenger.call(config.action, [normalizedAssetId]);
    return;
  }

  const blob = await caller.messenger.call(
    'AuthenticatedUserStorageService:getUserAssets',
  );
  // No stored blob means there is nothing to strip.
  if (blob === null) {
    return;
  }
  // Already absent means there is nothing to write (avoids version churn).
  if (!blob[config.stripFrom].includes(normalizedAssetId)) {
    return;
  }
  const nextBlob: UserAssetsBlob = {
    ...blob,
    [config.stripFrom]: blob[config.stripFrom].filter(
      (id) => id !== normalizedAssetId,
    ),
  };
  await caller.messenger.call(
    'AuthenticatedUserStorageService:setUserAssets',
    nextBlob,
  );
}

/**
 * FIFO chain of AUS syncs, so they apply strictly in invocation order — the
 * order the local mutations were applied — never the order the decorated
 * methods' post-mutation work happens to settle.
 */
let ausSyncChain: Promise<void> = Promise.resolve();

/**
 * Queue an AUS sync on the chain, swallowing and debug-logging any failure so
 * it can never block or roll back the local state change that already
 * happened.
 *
 * @param caller - The controller whose messenger to call AUS actions on.
 * @param config - The AUS behavior configured for the invoked method.
 * @param assetId - The CAIP-19 asset ID the method was invoked with.
 */
function fireAusSync(
  caller: AusSyncCaller,
  config: AusSyncConfig,
  assetId: Caip19AssetId,
): void {
  ausSyncChain = ausSyncChain
    .then(() => syncUserAssetsToAus(caller, config, assetId))
    .catch((error: unknown) => {
      log('Failed to sync user assets to AUS', { assetId, error });
    });
}

/**
 * Method decorator that mirrors custom-token state changes to AUS user
 * storage. The sync is queued as soon as the decorated method has applied
 * its local mutation — which every configured method does before it returns
 * or first awaits — and queued syncs run in invocation order, so a later
 * mutation can never overwrite the AUS write of an earlier one still in
 * flight. Fire-and-forget: AUS failures are swallowed and debug-logged and
 * never roll back local state, and a locally failing method never writes to
 * AUS.
 *
 * @param target - The decorated custom-token method.
 * @param context - The decorator context.
 * @returns The wrapped method.
 * @throws If applied to a method that is not configured in
 * {@link AUS_SYNC_METHODS} (fails at class-definition time).
 */
export function syncAusUserAssets<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: Args) => Return
  >,
): (this: This, ...args: Args) => Return {
  const config =
    AUS_SYNC_METHODS[context.name as keyof typeof AUS_SYNC_METHODS];
  if (!config) {
    throw new Error(
      `@syncAusUserAssets applied to unconfigured method '${String(context.name)}'`,
    );
  }

  return function (this: This, ...args: Args): Return {
    const caller = this as unknown as AusSyncCaller;
    const result = target.call(this, ...args);
    // Every configured method applies its local mutation before it returns
    // or first awaits, so queue the sync now rather than when post-mutation
    // work settles — a later mutation then queues behind this sync instead
    // of racing it, and a post-mutation failure cannot skip the mirror of a
    // local change that already happened.
    fireAusSync(caller, config, args[config.assetIdArgIndex] as Caip19AssetId);
    return result;
  };
}
