import {
  Caip25CaveatType,
  caip25CaveatBuilder,
  caip25EndowmentBuilder,
} from '@metamask/chain-agnostic-permission';
import {
  KeyringControllerWithKeyringAction,
  KeyringTypes,
} from '@metamask/keyring-controller';
import {
  buildSnapEndowmentSpecifications,
  buildSnapRestrictedMethodSpecifications,
  caveatSpecifications as snapsCaveatsSpecifications,
  endowmentCaveatSpecifications as snapsEndowmentCaveatSpecifications,
} from '@metamask/snaps-rpc-methods';
import { createDeferredPromise } from '@metamask/utils';
import { RootMessenger } from 'src/initialization';

export const EndowmentPermissions = Object.freeze({
  'endowment:network-access': 'endowment:network-access',
  'endowment:transaction-insight': 'endowment:transaction-insight',
  'endowment:cronjob': 'endowment:cronjob',
  'endowment:ethereum-provider': 'endowment:ethereum-provider',
  'endowment:rpc': 'endowment:rpc',
  'endowment:webassembly': 'endowment:webassembly',
  'endowment:lifecycle-hooks': 'endowment:lifecycle-hooks',
  'endowment:multichain-provider': 'endowment:multichain-provider',
  'endowment:page-home': 'endowment:page-home',
  'endowment:page-settings': 'endowment:page-settings',
  'endowment:signature-insight': 'endowment:signature-insight',
  'endowment:name-lookup': 'endowment:name-lookup',
  'endowment:assets': 'endowment:assets',
  'endowment:protocol': 'endowment:protocol',
  'endowment:keyring': 'endowment:keyring',
} as const);

export const ExcludedSnapPermissions = Object.freeze({});

export const ExcludedSnapEndowments = Object.freeze({
  'endowment:caip25':
    'eth_accounts is disabled. For more information please see https://github.com/MetaMask/snaps/issues/990.',
});

/**
 * Gets the specifications for all permissions that will be recognized by the
 * PermissionController.
 *
 * @param messenger - The messenger.
 * @returns the permission specifications to construct the PermissionController.
 */
export const getPermissionSpecifications = (messenger: RootMessenger) => {
  return {
    [caip25EndowmentBuilder.targetName]:
      caip25EndowmentBuilder.specificationBuilder({}),
    ...buildSnapEndowmentSpecifications(Object.keys(ExcludedSnapEndowments)),
    ...buildSnapRestrictedMethodSpecifications(
      Object.keys(ExcludedSnapPermissions),
      {
        /**
         * Get user preferences.
         *
         * @returns An object containing the preferences relevant to Snaps. This
         * is a subset of the full preferences state.
         */
        getPreferences: () => {
          const {
            securityAlertsEnabled,
            useTransactionSimulations,
            useTokenDetection,
            privacyMode,
            useNftDetection,
            displayNftMedia,
            isMultiAccountBalancesEnabled,
            showTestNetworks,
          } = messenger.call('PreferencesController:getState');

          return {
            // TODO: Locale and currency.
            locale: 'en',
            currency: 'usd',
            hideBalances: privacyMode,
            useSecurityAlerts: securityAlertsEnabled,
            simulateOnChainActions: useTransactionSimulations,
            useTokenDetection,
            batchCheckBalances: isMultiAccountBalancesEnabled,
            displayNftMedia,
            useNftDetection,
            useExternalPricingData: true,
            showTestnets: showTestNetworks,
          };
        },

        clearSnapState: messenger.call.bind(
          messenger,
          'SnapController:clearSnapState',
        ),

        getMnemonic: getMnemonic.bind(null, messenger),
        getMnemonicSeed: getMnemonicSeed.bind(null, messenger),

        getUnlockPromise: async () => {
          if (messenger.call('KeyringController:getState').isUnlocked) {
            return Promise.resolve();
          }
          const { promise, resolve: resolveUnlock } = createDeferredPromise();
          messenger.subscribe('KeyringController:unlock', resolveUnlock);

          await promise;

          messenger.unsubscribe('KeyringController:unlock', resolveUnlock);
        },

        getSnap: messenger.call.bind(messenger, 'SnapController:getSnap'),
        handleSnapRpcRequest: messenger.call.bind(
          messenger,
          'SnapController:handleRequest',
        ),

        getSnapState: messenger.call.bind(
          messenger,
          'SnapController:getSnapState',
        ),

        requestUserApproval: messenger.call.bind(
          messenger,
          'ApprovalController:addAndShowApprovalRequest',
        ),

        /**
         * Show a native (system) notification.
         *
         * @param origin - The origin requesting the notification.
         * @param args - The notification arguments.
         * @param args.message - The notification message.
         * @returns A promise that resolves when the notification is shown.
         */
        showNativeNotification: (origin: string, args: { message: string }) =>
          messenger.call(
            'RateLimitController:call',
            origin,
            'showNativeNotification',
            // @ts-expect-error: `RateLimitController` methods aren't properly
            // typed yet.
            origin,
            args.message,
          ),

        /**
         * Show an in-app notification.
         *
         * @param origin - The origin requesting the notification.
         * @param args - The notification arguments.
         * @param args.message - The notification message.
         * @param args.title - The notification title.
         * @param args.footerLink - The notification footer link.
         * @param args.content - The notification content identifier.
         * @returns A promise that resolves when the notification is shown.
         */
        showInAppNotification: (
          origin: string,
          args: {
            message: string;
            title?: string;
            footerLink?: string;
            content?: string;
          },
        ) => {
          const { content, message, title, footerLink } = args;
          const notificationArgs = {
            interfaceId: content,
            message,
            title,
            footerLink,
          };

          return messenger.call(
            'RateLimitController:call',
            origin,
            'showInAppNotification',
            // @ts-expect-error: `RateLimitController` methods aren't properly
            // typed yet.
            origin,
            notificationArgs,
          );
        },

        updateSnapState: messenger.call.bind(
          messenger,
          'SnapController:updateSnapState',
        ),

        /**
         * If phishing detection is enabled, check for an updated phishing
         * list.
         */
        maybeUpdatePhishingList: () => {
          const { usePhishDetect } = messenger.call(
            'PreferencesController:getState',
          );

          if (!usePhishDetect) {
            return;
          }

          messenger.call('PhishingController:maybeUpdateState');
        },

        /**
         * Check whether a URL is on the phishing list.
         *
         * @param url - The URL to check.
         * @returns A boolean indicating whether the URL is on the phishing
         * list. If phishing detection is disabled, false is returned.
         */
        isOnPhishingList: (url: string) => {
          const { usePhishDetect } = messenger.call(
            'PreferencesController:getState',
          );

          if (!usePhishDetect) {
            return false;
          }

          return messenger.call('PhishingController:testOrigin', url).result;
        },

        createInterface: messenger.call.bind(
          messenger,
          'SnapInterfaceController:createInterface',
        ),

        getInterface: messenger.call.bind(
          messenger,
          'SnapInterfaceController:getInterface',
        ),

        /**
         * Get custom cryptography implementations for the client.
         *
         * @returns An object containing custom cryptography implementations.
         * We currently don't use any specific implementations, so this is an
         * empty object.
         */
        getClientCryptography: () => ({}),

        getSnapKeyring: async () => {
          // TODO: Use `withKeyring` instead.
          const [snapKeyring] = messenger.call(
            'KeyringController:getKeyringsByType',
            KeyringTypes.snap,
          );

          if (!snapKeyring) {
            messenger.call(
              'KeyringController:addNewKeyring',
              KeyringTypes.snap,
            );

            return messenger.call(
              'KeyringController:getKeyringsByType',
              KeyringTypes.snap,
            )[0];
          }

          return snapKeyring;
        },

        setInterfaceDisplayed: messenger.call.bind(
          messenger,
          'SnapInterfaceController:setInterfaceDisplayed',
        ),
      },
    ),
  };
};

/**
 * Gets the specifications for all caveats that will be recognized by the
 * PermissionController.
 *
 * @param messenger - The messenger.
 * @returns the caveat specifications to construct the PermissionController.
 */
export const getCaveatSpecifications = (messenger: RootMessenger) => {
  return {
    [Caip25CaveatType]: caip25CaveatBuilder({
      listAccounts: () => {
        const accounts = messenger.call('AccountsController:listAccounts');
        return accounts.map((account) => ({
          type: account.type,
          address: account.address as `0x${string}`,
        }));
      },
      findNetworkClientIdByChainId: (chainId: string) =>
        messenger.call(
          'NetworkController:findNetworkClientIdByChainId',
          chainId,
        ),
      isNonEvmScopeSupported: (scope: string) =>
        messenger.call('MultichainRoutingService:isSupportedScope', scope),
      getNonEvmAccountAddresses: (scope: string) =>
        messenger.call('MultichainRoutingService:getSupportedAccounts', scope),
    }),
    ...snapsCaveatsSpecifications,
    ...snapsEndowmentCaveatSpecifications,
  };
};

/**
 * All unrestricted methods recognized by the PermissionController.
 * Unrestricted methods are ignored by the permission system, but every
 * JSON-RPC request seen by the permission system must correspond to a
 * restricted or unrestricted method, or the request will be rejected with a
 * "method not found" error.
 */
export const unrestrictedMethods = Object.freeze([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_coinbase',
  'eth_decrypt',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  'eth_getEncryptionPublicKey',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_getLogs',
  'eth_getProof',
  'eth_getStorageAt',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getUncleByBlockHashAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'eth_getUncleCountByBlockHash',
  'eth_getUncleCountByBlockNumber',
  'eth_getWork',
  'eth_hashrate',
  'eth_mining',
  'eth_newBlockFilter',
  'eth_newFilter',
  'eth_newPendingTransactionFilter',
  'eth_protocolVersion',
  'eth_requestAccounts',
  'eth_sendRawTransaction',
  'eth_sendTransaction',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_submitHashrate',
  'eth_submitWork',
  'eth_subscribe',
  'eth_syncing',
  'eth_uninstallFilter',
  'eth_unsubscribe',
  'metamask_getProviderState',
  'metamask_logWeb3ShimUsage',
  'metamask_sendDomainMetadata',
  'metamask_watchAsset',
  'net_listening',
  'net_peerCount',
  'net_version',
  'personal_ecRecover',
  'personal_sign',
  'wallet_requestExecutionPermissions',
  'wallet_getSupportedExecutionPermissions',
  'wallet_getGrantedExecutionPermissions',
  'wallet_addEthereumChain',
  'wallet_getCallsStatus',
  'wallet_getCapabilities',
  'wallet_getPermissions',
  'wallet_requestPermissions',
  'wallet_revokePermissions',
  'wallet_registerOnboarding',
  'wallet_sendCalls',
  'wallet_switchEthereumChain',
  'wallet_watchAsset',
  'wallet_upgradeAccount',
  'wallet_getAccountUpgradeStatus',
  'web3_clientVersion',
  'web3_sha3',
  'wallet_getAllSnaps',
  'wallet_getSnaps',
  'wallet_requestSnaps',
  'wallet_invokeSnap',
  'wallet_invokeKeyring',
  'snap_getClientStatus',
  'snap_clearState',
  'snap_getFile',
  'snap_getState',
  'snap_listEntropySources',
  'snap_createInterface',
  'snap_updateInterface',
  'snap_getInterfaceState',
  'snap_getInterfaceContext',
  'snap_resolveInterface',
  'snap_setState',
  'snap_scheduleBackgroundEvent',
  'snap_cancelBackgroundEvent',
  'snap_getBackgroundEvents',
  'snap_trackError',
  'snap_trackEvent',
  'snap_openWebSocket',
  'snap_sendWebSocketMessage',
  'snap_closeWebSocket',
  'snap_getWebSockets',
  'snap_startTrace',
  'snap_endTrace',
]);

/**
 * Get the mnemonic for a given entropy source. If no source is
 * provided, the primary HD keyring's mnemonic will be returned.
 *
 * @param messenger - The messenger.
 * @param source - The ID of the entropy source keyring.
 * @returns The mnemonic.
 */
export async function getMnemonic(
  messenger: RootMessenger<KeyringControllerWithKeyringAction, never>,
  source?: string | undefined,
): Promise<Uint8Array> {
  if (!source) {
    const mnemonic = (await messenger.call(
      'KeyringController:withKeyring',
      {
        type: KeyringTypes.hd,
        index: 0,
      },
      async ({ keyring }) => (keyring as HdKeyring).mnemonic,
    )) as Uint8Array | null;

    if (!mnemonic) {
      throw new Error('Primary keyring mnemonic unavailable.');
    }

    return mnemonic;
  }

  try {
    const keyringData = await messenger.call(
      'KeyringController:withKeyring',
      {
        id: source,
      },
      async ({ keyring }) => ({
        type: keyring.type,
        mnemonic: (keyring as HdKeyring).mnemonic,
      }),
    );

    const { type, mnemonic } = keyringData as {
      type: string;
      mnemonic?: Uint8Array;
    };

    if (type !== KeyringTypes.hd || !mnemonic) {
      // The keyring isn't guaranteed to have a mnemonic (e.g.,
      // hardware wallets, which can't be used as entropy sources),
      // so we throw an error if it doesn't.
      throw new Error(`Entropy source with ID "${source}" not found.`);
    }

    return mnemonic;
  } catch {
    throw new Error(`Entropy source with ID "${source}" not found.`);
  }
}

/**
 * Get the mnemonic seed for a given entropy source. If no source is
 * provided, the primary HD keyring's mnemonic seed will be returned.
 *
 * @param messenger - The messenger.
 * @param source - The ID of the entropy source keyring.
 * @returns The mnemonic seed.
 */
export async function getMnemonicSeed(
  messenger: RootMessenger<KeyringControllerWithKeyringAction, never>,
  source?: string | undefined,
): Promise<Uint8Array> {
  if (!source) {
    const seed = (await messenger.call(
      'KeyringController:withKeyring',
      {
        type: KeyringTypes.hd,
        index: 0,
      },
      async ({ keyring }) => (keyring as HdKeyring).seed,
    )) as Uint8Array | null;

    if (!seed) {
      throw new Error('Primary keyring mnemonic unavailable.');
    }

    return seed;
  }

  try {
    const keyringData = await messenger.call(
      'KeyringController:withKeyring',
      {
        id: source,
      },
      async ({ keyring }) => ({
        type: keyring.type,
        seed: (keyring as HdKeyring).seed,
      }),
    );

    const { type, seed } = keyringData as { type: string; seed?: Uint8Array };

    if (type !== KeyringTypes.hd || !seed) {
      // The keyring isn't guaranteed to have a mnemonic (e.g.,
      // hardware wallets, which can't be used as entropy sources),
      // so we throw an error if it doesn't.
      throw new Error(`Entropy source with ID "${source}" not found.`);
    }

    return seed;
  } catch {
    throw new Error(`Entropy source with ID "${source}" not found.`);
  }
}
