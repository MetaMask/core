"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunk5FUMSWDDjs = require('./chunk-5FUMSWDD.js');


var _chunkHZEB53A6js = require('./chunk-HZEB53A6.js');





var _chunkDNVD3CHQjs = require('./chunk-DNVD3CHQ.js');







var _chunkNOYP2T77js = require('./chunk-NOYP2T77.js');


var _chunkTLX5QQK5js = require('./chunk-TLX5QQK5.js');





var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/NotificationServicesController/NotificationServicesController.ts
var _basecontroller = require('@metamask/base-controller');
var _controllerutils = require('@metamask/controller-utils');
var _loglevel = require('loglevel'); var _loglevel2 = _interopRequireDefault(_loglevel);
var controllerName = "NotificationServicesController";
var metadata = {
  subscriptionAccountsSeen: {
    persist: true,
    anonymous: true
  },
  isMetamaskNotificationsFeatureSeen: {
    persist: true,
    anonymous: false
  },
  isNotificationServicesEnabled: {
    persist: true,
    anonymous: false
  },
  isFeatureAnnouncementsEnabled: {
    persist: true,
    anonymous: false
  },
  metamaskNotificationsList: {
    persist: true,
    anonymous: true
  },
  metamaskNotificationsReadList: {
    persist: true,
    anonymous: true
  },
  isUpdatingMetamaskNotifications: {
    persist: false,
    anonymous: false
  },
  isFetchingMetamaskNotifications: {
    persist: false,
    anonymous: false
  },
  isUpdatingMetamaskNotificationsAccount: {
    persist: false,
    anonymous: false
  },
  isCheckingAccountsPresence: {
    persist: false,
    anonymous: false
  }
};
var defaultState = {
  subscriptionAccountsSeen: [],
  isMetamaskNotificationsFeatureSeen: false,
  isNotificationServicesEnabled: false,
  isFeatureAnnouncementsEnabled: false,
  metamaskNotificationsList: [],
  metamaskNotificationsReadList: [],
  isUpdatingMetamaskNotifications: false,
  isFetchingMetamaskNotifications: false,
  isUpdatingMetamaskNotificationsAccount: [],
  isCheckingAccountsPresence: false
};
var _isPushIntegrated, _auth, _storage, _pushNotifications, _accounts, _featureAnnouncementEnv, _registerMessageHandlers, registerMessageHandlers_fn, _clearLoadingStates, clearLoadingStates_fn, _assertAuthEnabled, assertAuthEnabled_fn, _getValidStorageKeyAndBearerToken, getValidStorageKeyAndBearerToken_fn, _performEnableProfileSyncing, _assertUserStorage, assertUserStorage_fn, _getUserStorage, getUserStorage_fn, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn, _setIsFetchingMetamaskNotifications, setIsFetchingMetamaskNotifications_fn, _setIsCheckingAccountsPresence, setIsCheckingAccountsPresence_fn, _updateUpdatingAccountsState, updateUpdatingAccountsState_fn, _clearUpdatingAccountsState, clearUpdatingAccountsState_fn;
var NotificationServicesController = class extends _basecontroller.BaseController {
  /**
   * Creates a NotificationServicesController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   * @param args.env - environment variables for a given controller.
   * @param args.env.featureAnnouncements - env variables for feature announcements.
   * @param args.env.isPushIntegrated - toggle push notifications on/off if client has integrated them.
   */
  constructor({
    messenger,
    state,
    env
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state }
    });
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _clearLoadingStates);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _assertAuthEnabled);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getValidStorageKeyAndBearerToken);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _assertUserStorage);
    /**
     * Retrieves and parses the user storage from the storage key.
     *
     * This method attempts to retrieve the user storage using the specified storage key,
     * then parses the JSON string to an object. If the storage is not found or cannot be parsed,
     * it throws an error.
     *
     * @returns The parsed user storage object or null
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getUserStorage);
    /**
     * Sets the state of notification creation process.
     *
     * This method updates the `isUpdatingMetamaskNotifications` state, which can be used to indicate
     * whether the notification creation process is currently active or not. This is useful
     * for UI elements that need to reflect the state of ongoing operations, such as loading
     * indicators or disabled buttons during processing.
     *
     * @param isUpdatingMetamaskNotifications - A boolean value representing the new state of the notification creation process.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _setIsUpdatingMetamaskNotifications);
    /**
     * Updates the state to indicate whether fetching of MetaMask notifications is in progress.
     *
     * This method is used to set the `isFetchingMetamaskNotifications` state, which can be utilized
     * to show or hide loading indicators in the UI when notifications are being fetched.
     *
     * @param isFetchingMetamaskNotifications - A boolean value representing the fetching state.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _setIsFetchingMetamaskNotifications);
    /**
     * Updates the state to indicate that the checking of accounts presence is in progress.
     *
     * This method modifies the `isCheckingAccountsPresence` state, which can be used to manage UI elements
     * that depend on the status of account presence checks, such as displaying loading indicators or disabling
     * buttons while the check is ongoing.
     *
     * @param isCheckingAccountsPresence - A boolean value indicating whether the account presence check is currently active.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _setIsCheckingAccountsPresence);
    /**
     * Updates the state to indicate that account updates are in progress.
     * Removes duplicate accounts before updating the state.
     *
     * @param accounts - The accounts being updated.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _updateUpdatingAccountsState);
    /**
     * Clears the state indicating that account updates are complete.
     *
     * @param accounts - The accounts that have finished updating.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _clearUpdatingAccountsState);
    // Temporary boolean as push notifications are not yet enabled on mobile
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _isPushIntegrated, true);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _auth, {
      getBearerToken: async () => {
        return await this.messagingSystem.call(
          "AuthenticationController:getBearerToken"
        );
      },
      isSignedIn: () => {
        return this.messagingSystem.call("AuthenticationController:isSignedIn");
      }
    });
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _storage, {
      enableProfileSyncing: async () => {
        return await this.messagingSystem.call(
          "UserStorageController:enableProfileSyncing"
        );
      },
      getStorageKey: () => {
        return this.messagingSystem.call("UserStorageController:getStorageKey");
      },
      getNotificationStorage: async () => {
        return await this.messagingSystem.call(
          "UserStorageController:performGetStorage",
          "notifications.notificationSettings"
        );
      },
      setNotificationStorage: async (state) => {
        return await this.messagingSystem.call(
          "UserStorageController:performSetStorage",
          "notifications.notificationSettings",
          state
        );
      }
    });
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _pushNotifications, {
      enablePushNotifications: async (UUIDs) => {
        if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _isPushIntegrated)) {
          return;
        }
        try {
          await this.messagingSystem.call(
            "NotificationServicesPushController:enablePushNotifications",
            UUIDs
          );
        } catch (e) {
          _loglevel2.default.error("Silently failed to enable push notifications", e);
        }
      },
      disablePushNotifications: async (UUIDs) => {
        if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _isPushIntegrated)) {
          return;
        }
        try {
          await this.messagingSystem.call(
            "NotificationServicesPushController:disablePushNotifications",
            UUIDs
          );
        } catch (e) {
          _loglevel2.default.error("Silently failed to disable push notifications", e);
        }
      },
      updatePushNotifications: async (UUIDs) => {
        if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _isPushIntegrated)) {
          return;
        }
        try {
          await this.messagingSystem.call(
            "NotificationServicesPushController:updateTriggerPushNotifications",
            UUIDs
          );
        } catch (e) {
          _loglevel2.default.error("Silently failed to update push notifications", e);
        }
      },
      subscribe: () => {
        if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _isPushIntegrated)) {
          return;
        }
        this.messagingSystem.subscribe(
          "NotificationServicesPushController:onNewNotifications",
          (notification) => {
            this.updateMetamaskNotificationsList(notification);
          }
        );
      },
      initializePushNotifications: async () => {
        if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _isPushIntegrated)) {
          return;
        }
        if (!this.state.isNotificationServicesEnabled) {
          return;
        }
        const storage = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this);
        if (!storage) {
          return;
        }
        const uuids = _chunkNOYP2T77js.getAllUUIDs.call(void 0, storage);
        await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).enablePushNotifications(uuids);
      }
    });
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _accounts, {
      /**
       * Used to get list of addresses from keyring (wallet addresses)
       *
       * @returns addresses removed, added, and latest list of addresses
       */
      listAccounts: async () => {
        const nonChecksumAccounts = await this.messagingSystem.call(
          "KeyringController:getAccounts"
        );
        const accounts = nonChecksumAccounts.map((a) => _controllerutils.toChecksumHexAddress.call(void 0, a));
        const currentAccountsSet = new Set(accounts);
        const prevAccountsSet = new Set(this.state.subscriptionAccountsSeen);
        if (accounts.length === 0) {
          return {
            accountsAdded: [],
            accountsRemoved: [],
            accounts: []
          };
        }
        const accountsAdded = accounts.filter((a) => !prevAccountsSet.has(a));
        const accountsRemoved = [...prevAccountsSet.values()].filter(
          (a) => !currentAccountsSet.has(a)
        );
        this.update((state) => {
          state.subscriptionAccountsSeen = [...prevAccountsSet, ...accountsAdded];
        });
        return {
          accountsAdded,
          accountsRemoved,
          accounts
        };
      },
      /**
       * Initializes the cache/previous list. This is handy so we have an accurate in-mem state of the previous list of accounts.
       *
       * @returns result from list accounts
       */
      initialize: () => {
        return _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _accounts).listAccounts();
      },
      /**
       * Subscription to any state change in the keyring controller (aka wallet accounts).
       * We can call the `listAccounts` defined above to find out about any accounts added, removed
       * And call effects to subscribe/unsubscribe to notifications.
       */
      subscribe: () => {
        this.messagingSystem.subscribe(
          "KeyringController:stateChange",
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          async () => {
            if (!this.state.isNotificationServicesEnabled) {
              return;
            }
            const { accountsAdded, accountsRemoved } = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _accounts).listAccounts();
            const promises = [];
            if (accountsAdded.length > 0) {
              promises.push(this.updateOnChainTriggersByAccount(accountsAdded));
            }
            if (accountsRemoved.length > 0) {
              promises.push(this.deleteOnChainTriggersByAccount(accountsRemoved));
            }
            await Promise.all(promises);
          }
        );
      }
    });
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _featureAnnouncementEnv, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _performEnableProfileSyncing, async () => {
      try {
        await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).enableProfileSyncing();
      } catch (e) {
        _loglevel2.default.error("Failed to enable profile syncing", e);
        throw new Error("Failed to enable profile syncing");
      }
    });
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _isPushIntegrated, env.isPushIntegrated ?? true);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _featureAnnouncementEnv, env.featureAnnouncements);
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _clearLoadingStates, clearLoadingStates_fn).call(this);
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _accounts).initialize();
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).initializePushNotifications();
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _accounts).subscribe();
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).subscribe();
  }
  /**
   * Retrieves the current enabled state of MetaMask notifications.
   *
   * This method directly returns the boolean value of `isMetamaskNotificationsEnabled`
   * from the controller's state, indicating whether MetaMask notifications are currently enabled.
   *
   * @returns The enabled state of MetaMask notifications.
   */
  selectIsNotificationServicesEnabled() {
    return this.state.isNotificationServicesEnabled;
  }
  async checkAccountsPresence(accounts) {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsCheckingAccountsPresence, setIsCheckingAccountsPresence_fn).call(this, true);
      const userStorage = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this);
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertUserStorage, assertUserStorage_fn).call(this, userStorage);
      const presence = _chunkNOYP2T77js.checkAccountsPresence.call(void 0, userStorage, accounts);
      return presence;
    } catch (error) {
      _loglevel2.default.error("Failed to check accounts presence", error);
      throw error;
    } finally {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsCheckingAccountsPresence, setIsCheckingAccountsPresence_fn).call(this, false);
    }
  }
  /**
   * Sets the enabled state of feature announcements.
   *
   * **Action** - used in the notification settings to enable/disable feature announcements.
   *
   * @param featureAnnouncementsEnabled - A boolean value indicating the desired enabled state of the feature announcements.
   * @async
   * @throws {Error} If fails to update
   */
  async setFeatureAnnouncementsEnabled(featureAnnouncementsEnabled) {
    try {
      this.update((s) => {
        s.isFeatureAnnouncementsEnabled = featureAnnouncementsEnabled;
      });
    } catch (e) {
      _loglevel2.default.error("Unable to toggle feature announcements", e);
      throw new Error("Unable to toggle feature announcements");
    }
  }
  /**
   * This creates/re-creates on-chain triggers defined in User Storage.
   *
   * **Action** - Used during Sign In / Enabling of notifications.
   *
   * @returns The updated or newly created user storage.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  async createOnChainTriggers() {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn).call(this, true);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _performEnableProfileSyncing).call(this);
      const { bearerToken, storageKey } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getValidStorageKeyAndBearerToken, getValidStorageKeyAndBearerToken_fn).call(this);
      const { accounts } = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _accounts).listAccounts();
      let userStorage = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this);
      if (userStorage?.[_chunkTLX5QQK5js.USER_STORAGE_VERSION_KEY] === void 0) {
        userStorage = _chunkNOYP2T77js.initializeUserStorage.call(void 0, 
          accounts.map((account) => ({ address: account })),
          false
        );
        await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).setNotificationStorage(JSON.stringify(userStorage));
      }
      const triggers = _chunkNOYP2T77js.traverseUserStorageTriggers.call(void 0, userStorage);
      await _chunkDNVD3CHQjs.createOnChainTriggers.call(void 0, 
        userStorage,
        storageKey,
        bearerToken,
        triggers
      );
      const allUUIDS = _chunkNOYP2T77js.getAllUUIDs.call(void 0, userStorage);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).enablePushNotifications(allUUIDS);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).setNotificationStorage(JSON.stringify(userStorage));
      this.update((state) => {
        state.isNotificationServicesEnabled = true;
        state.isFeatureAnnouncementsEnabled = true;
        state.isMetamaskNotificationsFeatureSeen = true;
      });
      return userStorage;
    } catch (err) {
      _loglevel2.default.error("Failed to create On Chain triggers", err);
      throw new Error("Failed to create On Chain triggers");
    } finally {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn).call(this, false);
    }
  }
  /**
   * Enables all MetaMask notifications for the user.
   * This is identical flow when initializing notifications for the first time.
   * 1. Enable Profile Syncing
   * 2. Get or Create Notification User Storage
   * 3. Upsert Triggers
   * 4. Update Push notifications
   *
   * @throws {Error} If there is an error during the process of enabling notifications.
   */
  async enableMetamaskNotifications() {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn).call(this, true);
      await this.createOnChainTriggers();
    } catch (e) {
      _loglevel2.default.error("Unable to enable notifications", e);
      throw new Error("Unable to enable notifications");
    } finally {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn).call(this, false);
    }
  }
  /**
   * Disables all MetaMask notifications for the user.
   * This method ensures that the user is authenticated, retrieves all linked accounts,
   * and disables on-chain triggers for each account. It also sets the global notification
   * settings for MetaMask, feature announcements to false.
   *
   * @throws {Error} If the user is not authenticated or if there is an error during the process.
   */
  async disableNotificationServices() {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn).call(this, true);
      const userStorage = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this);
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertUserStorage, assertUserStorage_fn).call(this, userStorage);
      const UUIDs = _chunkNOYP2T77js.getAllUUIDs.call(void 0, userStorage);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).disablePushNotifications(UUIDs);
      this.update((state) => {
        state.isNotificationServicesEnabled = false;
        state.isFeatureAnnouncementsEnabled = false;
        state.metamaskNotificationsList = [];
      });
    } catch (e) {
      _loglevel2.default.error("Unable to disable notifications", e);
      throw new Error("Unable to disable notifications");
    } finally {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsUpdatingMetamaskNotifications, setIsUpdatingMetamaskNotifications_fn).call(this, false);
    }
  }
  /**
   * Deletes on-chain triggers associated with a specific account.
   * This method performs several key operations:
   * 1. Validates Auth & Storage
   * 2. Finds and deletes all triggers associated with the account
   * 3. Disables any related push notifications
   * 4. Updates Storage to reflect new state.
   *
   * **Action** - When a user disables notifications for a given account in settings.
   *
   * @param accounts - The account for which on-chain triggers are to be deleted.
   * @returns A promise that resolves to void or an object containing a success message.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  async deleteOnChainTriggersByAccount(accounts) {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _updateUpdatingAccountsState, updateUpdatingAccountsState_fn).call(this, accounts);
      const { bearerToken, storageKey } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getValidStorageKeyAndBearerToken, getValidStorageKeyAndBearerToken_fn).call(this);
      const userStorage = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this);
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertUserStorage, assertUserStorage_fn).call(this, userStorage);
      const UUIDs = accounts.map((a) => _chunkNOYP2T77js.getUUIDsForAccount.call(void 0, userStorage, a.toLowerCase())).flat();
      if (UUIDs.length === 0) {
        return userStorage;
      }
      await _chunkDNVD3CHQjs.deleteOnChainTriggers.call(void 0, 
        userStorage,
        storageKey,
        bearerToken,
        UUIDs
      );
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).disablePushNotifications(UUIDs);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).setNotificationStorage(JSON.stringify(userStorage));
      return userStorage;
    } catch (err) {
      _loglevel2.default.error("Failed to delete OnChain triggers", err);
      throw new Error("Failed to delete OnChain triggers");
    } finally {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _clearUpdatingAccountsState, clearUpdatingAccountsState_fn).call(this, accounts);
    }
  }
  /**
   * Updates/Creates on-chain triggers for a specific account.
   *
   * This method performs several key operations:
   * 1. Validates Auth & Storage
   * 2. Finds and creates any missing triggers associated with the account
   * 3. Enables any related push notifications
   * 4. Updates Storage to reflect new state.
   *
   * **Action** - When a user enables notifications for an account
   *
   * @param accounts - List of accounts you want to update.
   * @returns A promise that resolves to the updated user storage.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  async updateOnChainTriggersByAccount(accounts) {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _updateUpdatingAccountsState, updateUpdatingAccountsState_fn).call(this, accounts);
      const { bearerToken, storageKey } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getValidStorageKeyAndBearerToken, getValidStorageKeyAndBearerToken_fn).call(this);
      const userStorage = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this);
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertUserStorage, assertUserStorage_fn).call(this, userStorage);
      accounts.forEach((a) => _chunkNOYP2T77js.upsertAddressTriggers.call(void 0, a, userStorage));
      const newTriggers = _chunkNOYP2T77js.traverseUserStorageTriggers.call(void 0, userStorage, {
        mapTrigger: (t) => {
          if (!t.enabled) {
            return t;
          }
          return void 0;
        }
      });
      if (newTriggers.length > 0) {
        await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).setNotificationStorage(JSON.stringify(userStorage));
        const triggers = _chunkNOYP2T77js.traverseUserStorageTriggers.call(void 0, userStorage, {
          mapTrigger: (t) => {
            if (accounts.some((a) => a.toLowerCase() === t.address.toLowerCase())) {
              return t;
            }
            return void 0;
          }
        });
        await _chunkDNVD3CHQjs.createOnChainTriggers.call(void 0, 
          userStorage,
          storageKey,
          bearerToken,
          triggers
        );
      }
      const UUIDs = _chunkNOYP2T77js.getAllUUIDs.call(void 0, userStorage);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushNotifications).updatePushNotifications(UUIDs);
      await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).setNotificationStorage(JSON.stringify(userStorage));
      return userStorage;
    } catch (err) {
      _loglevel2.default.error("Failed to update OnChain triggers", err);
      throw new Error("Failed to update OnChain triggers");
    } finally {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _clearUpdatingAccountsState, clearUpdatingAccountsState_fn).call(this, accounts);
    }
  }
  /**
   * Fetches the list of metamask notifications.
   * This includes OnChain notifications and Feature Announcements.
   *
   * **Action** - When a user views the notification list page/dropdown
   *
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  async fetchAndUpdateMetamaskNotifications() {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsFetchingMetamaskNotifications, setIsFetchingMetamaskNotifications_fn).call(this, true);
      const rawFeatureAnnouncementNotifications = this.state.isFeatureAnnouncementsEnabled ? await _chunkHZEB53A6js.getFeatureAnnouncementNotifications.call(void 0, 
        _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _featureAnnouncementEnv)
      ).catch(() => []) : [];
      const rawOnChainNotifications = [];
      const userStorage = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).getNotificationStorage().then((s) => s && JSON.parse(s)).catch(() => null);
      const bearerToken = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).getBearerToken().catch(() => null);
      if (userStorage && bearerToken) {
        const notifications = await _chunkDNVD3CHQjs.getOnChainNotifications.call(void 0, 
          userStorage,
          bearerToken
        ).catch(() => []);
        rawOnChainNotifications.push(...notifications);
      }
      const readIds = this.state.metamaskNotificationsReadList;
      const isNotUndefined = (t) => Boolean(t);
      const processAndFilter = (ns) => ns.map((n) => _chunk5FUMSWDDjs.safeProcessNotification.call(void 0, n, readIds)).filter(isNotUndefined);
      const featureAnnouncementNotifications = processAndFilter(
        rawFeatureAnnouncementNotifications
      );
      const onChainNotifications = processAndFilter(rawOnChainNotifications);
      const metamaskNotifications = [
        ...featureAnnouncementNotifications,
        ...onChainNotifications
      ];
      metamaskNotifications.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      this.update((state) => {
        state.metamaskNotificationsList = metamaskNotifications;
      });
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsFetchingMetamaskNotifications, setIsFetchingMetamaskNotifications_fn).call(this, false);
      return metamaskNotifications;
    } catch (err) {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsFetchingMetamaskNotifications, setIsFetchingMetamaskNotifications_fn).call(this, false);
      _loglevel2.default.error("Failed to fetch notifications", err);
      throw new Error("Failed to fetch notifications");
    }
  }
  /**
   * Marks specified metamask notifications as read.
   *
   * @param notifications - An array of notifications to be marked as read. Each notification should include its type and read status.
   * @returns A promise that resolves when the operation is complete.
   */
  async markMetamaskNotificationsAsRead(notifications) {
    let onchainNotificationIds = [];
    let featureAnnouncementNotificationIds = [];
    try {
      const onChainNotifications = notifications.filter(
        (notification) => notification.type !== "features_announcement" /* FEATURES_ANNOUNCEMENT */ && !notification.isRead
      );
      const featureAnnouncementNotifications = notifications.filter(
        (notification) => notification.type === "features_announcement" /* FEATURES_ANNOUNCEMENT */ && !notification.isRead
      );
      if (onChainNotifications.length > 0) {
        const bearerToken = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).getBearerToken();
        if (bearerToken) {
          onchainNotificationIds = onChainNotifications.map(
            (notification) => notification.id
          );
          await _chunkDNVD3CHQjs.markNotificationsAsRead.call(void 0, 
            bearerToken,
            onchainNotificationIds
          ).catch(() => {
            onchainNotificationIds = [];
            _loglevel2.default.warn("Unable to mark onchain notifications as read");
          });
        }
      }
      if (featureAnnouncementNotifications.length > 0) {
        featureAnnouncementNotificationIds = featureAnnouncementNotifications.map(
          (notification) => notification.id
        );
      }
    } catch (err) {
      _loglevel2.default.warn("Something failed when marking notifications as read", err);
    }
    this.update((state) => {
      const currentReadList = state.metamaskNotificationsReadList;
      const newReadIds = [...featureAnnouncementNotificationIds];
      state.metamaskNotificationsReadList = [
        .../* @__PURE__ */ new Set([...currentReadList, ...newReadIds])
      ];
      state.metamaskNotificationsList = state.metamaskNotificationsList.map(
        (notification) => {
          if (newReadIds.includes(notification.id) || onchainNotificationIds.includes(notification.id)) {
            return { ...notification, isRead: true };
          }
          return notification;
        }
      );
    });
  }
  /**
   * Updates the list of MetaMask notifications by adding a new notification at the beginning of the list.
   * This method ensures that the most recent notification is displayed first in the UI.
   *
   * @param notification - The new notification object to be added to the list.
   * @returns A promise that resolves when the notification list has been successfully updated.
   */
  async updateMetamaskNotificationsList(notification) {
    if (this.state.metamaskNotificationsList.some((n) => n.id === notification.id)) {
      return;
    }
    const processedNotification = _chunk5FUMSWDDjs.safeProcessNotification.call(void 0, notification);
    if (processedNotification) {
      this.update((state) => {
        const existingNotificationIds = new Set(
          state.metamaskNotificationsList.map((n) => n.id)
        );
        if (!existingNotificationIds.has(notification.id)) {
          state.metamaskNotificationsList = [
            notification,
            ...state.metamaskNotificationsList
          ];
        }
      });
    }
  }
};
_isPushIntegrated = new WeakMap();
_auth = new WeakMap();
_storage = new WeakMap();
_pushNotifications = new WeakMap();
_accounts = new WeakMap();
_featureAnnouncementEnv = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    `${controllerName}:updateMetamaskNotificationsList`,
    this.updateMetamaskNotificationsList.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:disableNotificationServices`,
    this.disableNotificationServices.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:selectIsNotificationServicesEnabled`,
    this.selectIsNotificationServicesEnabled.bind(this)
  );
};
_clearLoadingStates = new WeakSet();
clearLoadingStates_fn = function() {
  this.update((state) => {
    state.isUpdatingMetamaskNotifications = false;
    state.isCheckingAccountsPresence = false;
    state.isFetchingMetamaskNotifications = false;
    state.isUpdatingMetamaskNotificationsAccount = [];
  });
};
_assertAuthEnabled = new WeakSet();
assertAuthEnabled_fn = function() {
  if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).isSignedIn()) {
    this.update((state) => {
      state.isNotificationServicesEnabled = false;
    });
    throw new Error("User is not signed in.");
  }
};
_getValidStorageKeyAndBearerToken = new WeakSet();
getValidStorageKeyAndBearerToken_fn = async function() {
  _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertAuthEnabled, assertAuthEnabled_fn).call(this);
  const bearerToken = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).getBearerToken();
  const storageKey = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).getStorageKey();
  if (!bearerToken || !storageKey) {
    throw new Error("Missing BearerToken or storage key");
  }
  return { bearerToken, storageKey };
};
_performEnableProfileSyncing = new WeakMap();
_assertUserStorage = new WeakSet();
assertUserStorage_fn = function(storage) {
  if (!storage) {
    throw new Error("User Storage does not exist");
  }
};
_getUserStorage = new WeakSet();
getUserStorage_fn = async function() {
  const userStorageString = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _storage).getNotificationStorage();
  if (!userStorageString) {
    return null;
  }
  try {
    const userStorage = JSON.parse(userStorageString);
    return userStorage;
  } catch (error) {
    _loglevel2.default.error("Unable to parse User Storage");
    return null;
  }
};
_setIsUpdatingMetamaskNotifications = new WeakSet();
setIsUpdatingMetamaskNotifications_fn = function(isUpdatingMetamaskNotifications) {
  this.update((state) => {
    state.isUpdatingMetamaskNotifications = isUpdatingMetamaskNotifications;
  });
};
_setIsFetchingMetamaskNotifications = new WeakSet();
setIsFetchingMetamaskNotifications_fn = function(isFetchingMetamaskNotifications) {
  this.update((state) => {
    state.isFetchingMetamaskNotifications = isFetchingMetamaskNotifications;
  });
};
_setIsCheckingAccountsPresence = new WeakSet();
setIsCheckingAccountsPresence_fn = function(isCheckingAccountsPresence) {
  this.update((state) => {
    state.isCheckingAccountsPresence = isCheckingAccountsPresence;
  });
};
_updateUpdatingAccountsState = new WeakSet();
updateUpdatingAccountsState_fn = function(accounts) {
  this.update((state) => {
    const uniqueAccounts = /* @__PURE__ */ new Set([
      ...state.isUpdatingMetamaskNotificationsAccount,
      ...accounts
    ]);
    state.isUpdatingMetamaskNotificationsAccount = Array.from(uniqueAccounts);
  });
};
_clearUpdatingAccountsState = new WeakSet();
clearUpdatingAccountsState_fn = function(accounts) {
  this.update((state) => {
    state.isUpdatingMetamaskNotificationsAccount = state.isUpdatingMetamaskNotificationsAccount.filter(
      (existingAccount) => !accounts.includes(existingAccount)
    );
  });
};




exports.defaultState = defaultState; exports.NotificationServicesController = NotificationServicesController;
//# sourceMappingURL=chunk-CGQRVA4Q.js.map