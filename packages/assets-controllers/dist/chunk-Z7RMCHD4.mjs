import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/AccountTrackerController.ts
import {
  query,
  safelyExecuteWithTimeout,
  toChecksumHexAddress
} from "@metamask/controller-utils";
import EthQuery from "@metamask/eth-query";
import { StaticIntervalPollingController } from "@metamask/polling-controller";
import { assert } from "@metamask/utils";
import { Mutex } from "async-mutex";
import { cloneDeep } from "lodash";
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
var AccountTrackerController = class extends StaticIntervalPollingController {
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
    __privateAdd(this, _getCurrentChainId);
    /**
     * Resolves a networkClientId to a network client config
     * or globally selected network config if not provided
     *
     * @param networkClientId - Optional networkClientId to fetch a network client with
     * @returns network client config
     */
    __privateAdd(this, _getCorrectNetworkClient);
    /**
     * Fetches the balance of a given address from the blockchain.
     *
     * @param address - The account address to fetch the balance for.
     * @param ethQuery - The EthQuery instance to query getBalnce with.
     * @returns A promise that resolves to the balance in a hex string format.
     */
    __privateAdd(this, _getBalanceFromChain);
    __privateAdd(this, _refreshMutex, new Mutex());
    __privateAdd(this, _handle, void 0);
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
    const accountsByChainId = cloneDeep(this.state.accountsByChainId);
    const existing = Object.keys(accounts);
    if (!accountsByChainId[newChainId]) {
      accountsByChainId[newChainId] = {};
      existing.forEach((address) => {
        accountsByChainId[newChainId][address] = { balance: "0x0" };
      });
    }
    const addresses = Object.values(
      this.messagingSystem.call("AccountsController:listAccounts").map(
        (internalAccount) => toChecksumHexAddress(internalAccount.address)
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
    if (__privateGet(this, _handle)) {
      clearTimeout(__privateGet(this, _handle));
    }
    await this.refresh();
    __privateSet(this, _handle, setTimeout(() => {
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
    const releaseLock = await __privateGet(this, _refreshMutex).acquire();
    try {
      const { chainId, ethQuery } = __privateMethod(this, _getCorrectNetworkClient, getCorrectNetworkClient_fn).call(this, networkClientId);
      this.syncAccounts(chainId);
      const { accounts, accountsByChainId } = this.state;
      const { isMultiAccountBalancesEnabled } = this.messagingSystem.call(
        "PreferencesController:getState"
      );
      const accountsToUpdate = isMultiAccountBalancesEnabled ? Object.keys(accounts) : [toChecksumHexAddress(selectedAccount.address)];
      const accountsForChain = { ...accountsByChainId[chainId] };
      for (const address of accountsToUpdate) {
        const balance = await __privateMethod(this, _getBalanceFromChain, getBalanceFromChain_fn).call(this, address, ethQuery);
        if (balance) {
          accountsForChain[address] = {
            balance
          };
        }
      }
      this.update((state) => {
        if (chainId === __privateMethod(this, _getCurrentChainId, getCurrentChainId_fn).call(this)) {
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
    const { ethQuery } = __privateMethod(this, _getCorrectNetworkClient, getCorrectNetworkClient_fn).call(this, networkClientId);
    return await Promise.all(
      addresses.map((address) => {
        return safelyExecuteWithTimeout(async () => {
          assert(ethQuery, "Provider not set.");
          const balance = await query(ethQuery, "getBalance", [address]);
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
    ethQuery: new EthQuery(provider)
  };
};
_getBalanceFromChain = new WeakSet();
getBalanceFromChain_fn = async function(address, ethQuery) {
  return await safelyExecuteWithTimeout(async () => {
    assert(ethQuery, "Provider not set.");
    return await query(ethQuery, "getBalance", [address]);
  });
};
var AccountTrackerController_default = AccountTrackerController;

export {
  AccountTrackerController,
  AccountTrackerController_default
};
//# sourceMappingURL=chunk-Z7RMCHD4.mjs.map