"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/AccountTrackerController.ts




var _controllerutils = require('@metamask/controller-utils');
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _pollingcontroller = require('@metamask/polling-controller');
var _utils = require('@metamask/utils');
var _asyncmutex = require('async-mutex');
var _lodash = require('lodash');
var controllerName = "AccountTrackerController";
var accountTrackerMetadata = {
  accounts: {
    persist: true,
    anonymous: false
  },
  accountsByChainId: {
    persist: true,
    anonymous: false
  }
};
var _refreshMutex, _handle, _getCurrentChainId, getCurrentChainId_fn, _getCorrectNetworkClient, getCorrectNetworkClient_fn, _getBalanceFromChain, getBalanceFromChain_fn;
var AccountTrackerController = class extends _pollingcontroller.StaticIntervalPollingController {
  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new account balances.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller messaging system.
   */
  constructor({
    interval = 1e4,
    state,
    messenger
  }) {
    const { selectedNetworkClientId } = messenger.call(
      "NetworkController:getState"
    );
    const {
      configuration: { chainId }
    } = messenger.call(
      "NetworkController:getNetworkClientById",
      selectedNetworkClientId
    );
    super({
      name: controllerName,
      messenger,
      state: {
        accounts: {},
        accountsByChainId: {
          [chainId]: {}
        },
        ...state
      },
      metadata: accountTrackerMetadata
    });
    /**
     * Gets the current chain ID.
     * @returns The current chain ID.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getCurrentChainId);
    /**
     * Resolves a networkClientId to a network client config
     * or globally selected network config if not provided
     *
     * @param networkClientId - Optional networkClientId to fetch a network client with
     * @returns network client config
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getCorrectNetworkClient);
    /**
     * Fetches the balance of a given address from the blockchain.
     *
     * @param address - The account address to fetch the balance for.
     * @param ethQuery - The EthQuery instance to query getBalnce with.
     * @returns A promise that resolves to the balance in a hex string format.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getBalanceFromChain);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _refreshMutex, new (0, _asyncmutex.Mutex)());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _handle, void 0);
    this.setIntervalLength(interval);
    this.poll();
    this.messagingSystem.subscribe(
      "AccountsController:selectedEvmAccountChange",
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => this.refresh()
    );
  }
  syncAccounts(newChainId) {
    const accounts = { ...this.state.accounts };
    const accountsByChainId = _lodash.cloneDeep.call(void 0, this.state.accountsByChainId);
    const existing = Object.keys(accounts);
    if (!accountsByChainId[newChainId]) {
      accountsByChainId[newChainId] = {};
      existing.forEach((address) => {
        accountsByChainId[newChainId][address] = { balance: "0x0" };
      });
    }
    const addresses = Object.values(
      this.messagingSystem.call("AccountsController:listAccounts").map(
        (internalAccount) => _controllerutils.toChecksumHexAddress.call(void 0, internalAccount.address)
      )
    );
    const newAddresses = addresses.filter(
      (address) => !existing.includes(address)
    );
    const oldAddresses = existing.filter(
      (address) => !addresses.includes(address)
    );
    newAddresses.forEach((address) => {
      accounts[address] = { balance: "0x0" };
    });
    Object.keys(accountsByChainId).forEach((chainId) => {
      newAddresses.forEach((address) => {
        accountsByChainId[chainId][address] = {
          balance: "0x0"
        };
      });
    });
    oldAddresses.forEach((address) => {
      delete accounts[address];
    });
    Object.keys(accountsByChainId).forEach((chainId) => {
      oldAddresses.forEach((address) => {
        delete accountsByChainId[chainId][address];
      });
    });
    this.update((state) => {
      state.accounts = accounts;
      state.accountsByChainId = accountsByChainId;
    });
  }
  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval trigger a 'refresh'.
   */
  async poll(interval) {
    if (interval) {
      this.setIntervalLength(interval);
    }
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _handle)) {
      clearTimeout(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _handle));
    }
    await this.refresh();
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _handle, setTimeout(() => {
      this.poll(this.getIntervalLength());
    }, this.getIntervalLength()));
  }
  /**
   * Refreshes the balances of the accounts using the networkClientId
   *
   * @param networkClientId - The network client ID used to get balances.
   */
  async _executePoll(networkClientId) {
    this.refresh(networkClientId);
  }
  /**
   * Refreshes the balances of the accounts depending on the multi-account setting.
   * If multi-account is disabled, only updates the selected account balance.
   * If multi-account is enabled, updates balances for all accounts.
   *
   * @param networkClientId - Optional networkClientId to fetch a network client with
   */
  async refresh(networkClientId) {
    const selectedAccount = this.messagingSystem.call(
      "AccountsController:getSelectedAccount"
    );
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _refreshMutex).acquire();
    try {
      const { chainId, ethQuery } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCorrectNetworkClient, getCorrectNetworkClient_fn).call(this, networkClientId);
      this.syncAccounts(chainId);
      const { accounts, accountsByChainId } = this.state;
      const { isMultiAccountBalancesEnabled } = this.messagingSystem.call(
        "PreferencesController:getState"
      );
      const accountsToUpdate = isMultiAccountBalancesEnabled ? Object.keys(accounts) : [_controllerutils.toChecksumHexAddress.call(void 0, selectedAccount.address)];
      const accountsForChain = { ...accountsByChainId[chainId] };
      for (const address of accountsToUpdate) {
        const balance = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getBalanceFromChain, getBalanceFromChain_fn).call(this, address, ethQuery);
        if (balance) {
          accountsForChain[address] = {
            balance
          };
        }
      }
      this.update((state) => {
        if (chainId === _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCurrentChainId, getCurrentChainId_fn).call(this)) {
          state.accounts = accountsForChain;
        }
        state.accountsByChainId[chainId] = accountsForChain;
      });
    } finally {
      releaseLock();
    }
  }
  /**
   * Sync accounts balances with some additional addresses.
   *
   * @param addresses - the additional addresses, may be hardware wallet addresses.
   * @param networkClientId - Optional networkClientId to fetch a network client with.
   * @returns accounts - addresses with synced balance
   */
  async syncBalanceWithAddresses(addresses, networkClientId) {
    const { ethQuery } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCorrectNetworkClient, getCorrectNetworkClient_fn).call(this, networkClientId);
    return await Promise.all(
      addresses.map((address) => {
        return _controllerutils.safelyExecuteWithTimeout.call(void 0, async () => {
          _utils.assert.call(void 0, ethQuery, "Provider not set.");
          const balance = await _controllerutils.query.call(void 0, ethQuery, "getBalance", [address]);
          return [address, balance];
        });
      })
    ).then((value) => {
      return value.reduce((obj, item) => {
        if (!item) {
          return obj;
        }
        const [address, balance] = item;
        return {
          ...obj,
          [address]: {
            balance
          }
        };
      }, {});
    });
  }
};
_refreshMutex = new WeakMap();
_handle = new WeakMap();
_getCurrentChainId = new WeakSet();
getCurrentChainId_fn = function() {
  const { selectedNetworkClientId } = this.messagingSystem.call(
    "NetworkController:getState"
  );
  const {
    configuration: { chainId }
  } = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  return chainId;
};
_getCorrectNetworkClient = new WeakSet();
getCorrectNetworkClient_fn = function(networkClientId) {
  const selectedNetworkClientId = networkClientId ?? this.messagingSystem.call("NetworkController:getState").selectedNetworkClientId;
  const {
    configuration: { chainId },
    provider
  } = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  return {
    chainId,
    ethQuery: new (0, _ethquery2.default)(provider)
  };
};
_getBalanceFromChain = new WeakSet();
getBalanceFromChain_fn = async function(address, ethQuery) {
  return await _controllerutils.safelyExecuteWithTimeout.call(void 0, async () => {
    _utils.assert.call(void 0, ethQuery, "Provider not set.");
    return await _controllerutils.query.call(void 0, ethQuery, "getBalance", [address]);
  });
};
var AccountTrackerController_default = AccountTrackerController;




exports.AccountTrackerController = AccountTrackerController; exports.AccountTrackerController_default = AccountTrackerController_default;
//# sourceMappingURL=chunk-HVOIBGYN.js.map