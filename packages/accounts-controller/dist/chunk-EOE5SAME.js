"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkBYPP7G2Njs = require('./chunk-BYPP7G2N.js');



var _chunkUJIPPGP6js = require('./chunk-UJIPPGP6.js');

// src/AccountsController.ts
var _basecontroller = require('@metamask/base-controller');
var _ethsnapkeyring = require('@metamask/eth-snap-keyring');




var _keyringapi = require('@metamask/keyring-api');
var _keyringcontroller = require('@metamask/keyring-controller');



var _utils = require('@metamask/utils');
var controllerName = "AccountsController";
var accountsControllerMetadata = {
  internalAccounts: {
    persist: true,
    anonymous: false
  }
};
var defaultState = {
  internalAccounts: {
    accounts: {},
    selectedAccount: ""
  }
};
var EMPTY_ACCOUNT = {
  id: "",
  address: "",
  options: {},
  methods: [],
  type: _keyringapi.EthAccountType.Eoa,
  metadata: {
    name: "",
    keyring: {
      type: ""
    },
    importTime: 0
  }
};
var _generateInternalAccountForNonSnapAccount, generateInternalAccountForNonSnapAccount_fn, _listSnapAccounts, listSnapAccounts_fn, _listNormalAccounts, listNormalAccounts_fn, _handleOnKeyringStateChange, handleOnKeyringStateChange_fn, _handleOnSnapStateChange, handleOnSnapStateChange_fn, _getAccountsByKeyringType, getAccountsByKeyringType_fn, _getLastSelectedAccount, getLastSelectedAccount_fn, _isAccountCompatibleWithChain, isAccountCompatibleWithChain_fn, _getLastSelectedIndex, getLastSelectedIndex_fn, _handleNewAccountAdded, handleNewAccountAdded_fn, _publishAccountChangeEvent, publishAccountChangeEvent_fn, _handleAccountRemoved, handleAccountRemoved_fn, _populateExistingMetadata, populateExistingMetadata_fn, _registerMessageHandlers, registerMessageHandlers_fn;
var AccountsController = class extends _basecontroller.BaseController {
  /**
   * Constructor for AccountsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: accountsControllerMetadata,
      state: {
        ...defaultState,
        ...state
      }
    });
    /**
     * Generates an internal account for a non-Snap account.
     * @param address - The address of the account.
     * @param type - The type of the account.
     * @returns The generated internal account.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _generateInternalAccountForNonSnapAccount);
    /**
     * Returns a list of internal accounts created using the SnapKeyring.
     *
     * @returns A promise that resolves to an array of InternalAccount objects.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _listSnapAccounts);
    /**
     * Returns a list of normal accounts.
     * Note: listNormalAccounts is a temporary method until the keyrings all implement the InternalAccount interface.
     * Once all keyrings implement the InternalAccount interface, this method can be removed and getAccounts can be used instead.
     *
     * @returns A Promise that resolves to an array of InternalAccount objects.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _listNormalAccounts);
    /**
     * Handles changes in the keyring state, specifically when new accounts are added or removed.
     *
     * @param keyringState - The new state of the keyring controller.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _handleOnKeyringStateChange);
    /**
     * Handles the change in SnapControllerState by updating the metadata of accounts that have a snap enabled.
     *
     * @param snapState - The new SnapControllerState.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _handleOnSnapStateChange);
    /**
     * Returns the list of accounts for a given keyring type.
     * @param keyringType - The type of keyring.
     * @param accounts - Accounts to filter by keyring type.
     * @returns The list of accounts associcated with this keyring type.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _getAccountsByKeyringType);
    /**
     * Returns the last selected account from the given array of accounts.
     *
     * @param accounts - An array of InternalAccount objects.
     * @returns The InternalAccount object that was last selected, or undefined if the array is empty.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _getLastSelectedAccount);
    /**
     * Checks if an account is compatible with a given chain namespace.
     * @private
     * @param account - The account to check compatibility for.
     * @param chainId - The CAIP2 to check compatibility with.
     * @returns Returns true if the account is compatible with the chain namespace, otherwise false.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _isAccountCompatibleWithChain);
    /**
     * Retrieves the index value for `metadata.lastSelected`.
     *
     * @returns The index value.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _getLastSelectedIndex);
    /**
     * Handles the addition of a new account to the controller.
     * If the account is not a Snap Keyring account, generates an internal account for it and adds it to the controller.
     * If the account is a Snap Keyring account, retrieves the account from the keyring and adds it to the controller.
     * @param accountsState - AccountsController accounts state that is to be mutated.
     * @param account - The address and keyring type object of the new account.
     * @returns The updated AccountsController accounts state.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _handleNewAccountAdded);
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _publishAccountChangeEvent);
    /**
     * Handles the removal of an account from the internal accounts list.
     * @param accountsState - AccountsController accounts state that is to be mutated.
     * @param accountId - The ID of the account to be removed.
     * @returns The updated AccountsController state.
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _handleAccountRemoved);
    /**
     * Retrieves the value of a specific metadata key for an existing account.
     * @param accountId - The ID of the account.
     * @param metadataKey - The key of the metadata to retrieve.
     * @param account - The account object to retrieve the metadata key from.
     * @returns The value of the specified metadata key, or undefined if the account or metadata key does not exist.
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _populateExistingMetadata);
    /**
     * Registers message handlers for the AccountsController.
     * @private
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _registerMessageHandlers);
    this.messagingSystem.subscribe(
      "SnapController:stateChange",
      (snapStateState) => _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _handleOnSnapStateChange, handleOnSnapStateChange_fn).call(this, snapStateState)
    );
    this.messagingSystem.subscribe(
      "KeyringController:stateChange",
      (keyringState) => _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _handleOnKeyringStateChange, handleOnKeyringStateChange_fn).call(this, keyringState)
    );
    _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  /**
   * Returns the internal account object for the given account ID, if it exists.
   *
   * @param accountId - The ID of the account to retrieve.
   * @returns The internal account object, or undefined if the account does not exist.
   */
  getAccount(accountId) {
    return this.state.internalAccounts.accounts[accountId];
  }
  /**
   * Returns an array of all evm internal accounts.
   *
   * @returns An array of InternalAccount objects.
   */
  listAccounts() {
    const accounts = Object.values(this.state.internalAccounts.accounts);
    return accounts.filter((account) => _keyringapi.isEvmAccountType.call(void 0, account.type));
  }
  /**
   * Returns an array of all internal accounts.
   *
   * @param chainId - The chain ID.
   * @returns An array of InternalAccount objects.
   */
  listMultichainAccounts(chainId) {
    const accounts = Object.values(this.state.internalAccounts.accounts);
    if (!chainId) {
      return accounts;
    }
    if (!_utils.isCaipChainId.call(void 0, chainId)) {
      throw new Error(`Invalid CAIP-2 chain ID: ${String(chainId)}`);
    }
    return accounts.filter(
      (account) => _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _isAccountCompatibleWithChain, isAccountCompatibleWithChain_fn).call(this, account, chainId)
    );
  }
  /**
   * Returns the internal account object for the given account ID.
   *
   * @param accountId - The ID of the account to retrieve.
   * @returns The internal account object.
   * @throws An error if the account ID is not found.
   */
  getAccountExpect(accountId) {
    const account = this.getAccount(accountId);
    if (account === void 0) {
      throw new Error(`Account Id "${accountId}" not found`);
    }
    return account;
  }
  /**
   * Returns the last selected EVM account.
   *
   * @returns The selected internal account.
   */
  getSelectedAccount() {
    if (this.state.internalAccounts.selectedAccount === "") {
      return EMPTY_ACCOUNT;
    }
    const selectedAccount = this.getAccountExpect(
      this.state.internalAccounts.selectedAccount
    );
    if (_keyringapi.isEvmAccountType.call(void 0, selectedAccount.type)) {
      return selectedAccount;
    }
    const accounts = this.listAccounts();
    if (!accounts.length) {
      throw new Error("No EVM accounts");
    }
    return _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _getLastSelectedAccount, getLastSelectedAccount_fn).call(this, accounts);
  }
  /**
   * __WARNING The return value may be undefined if there isn't an account for that chain id.__
   *
   * Retrieves the last selected account by chain ID.
   *
   * @param chainId - The chain ID to filter the accounts.
   * @returns The last selected account compatible with the specified chain ID or undefined.
   */
  getSelectedMultichainAccount(chainId) {
    if (this.state.internalAccounts.selectedAccount === "") {
      return EMPTY_ACCOUNT;
    }
    if (!chainId) {
      return this.getAccountExpect(this.state.internalAccounts.selectedAccount);
    }
    if (!_utils.isCaipChainId.call(void 0, chainId)) {
      throw new Error(`Invalid CAIP-2 chain ID: ${chainId}`);
    }
    const accounts = Object.values(this.state.internalAccounts.accounts).filter(
      (account) => _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _isAccountCompatibleWithChain, isAccountCompatibleWithChain_fn).call(this, account, chainId)
    );
    return _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _getLastSelectedAccount, getLastSelectedAccount_fn).call(this, accounts);
  }
  /**
   * Returns the account with the specified address.
   * ! This method will only return the first account that matches the address
   * @param address - The address of the account to retrieve.
   * @returns The account with the specified address, or undefined if not found.
   */
  getAccountByAddress(address) {
    return this.listMultichainAccounts().find(
      (account) => account.address.toLowerCase() === address.toLowerCase()
    );
  }
  /**
   * Sets the selected account by its ID.
   *
   * @param accountId - The ID of the account to be selected.
   */
  setSelectedAccount(accountId) {
    const account = this.getAccountExpect(accountId);
    this.update((currentState) => {
      currentState.internalAccounts.accounts[account.id].metadata.lastSelected = Date.now();
      currentState.internalAccounts.selectedAccount = account.id;
    });
    _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _publishAccountChangeEvent, publishAccountChangeEvent_fn).call(this, account);
  }
  /**
   * Sets the name of the account with the given ID.
   *
   * @param accountId - The ID of the account to set the name for.
   * @param accountName - The new name for the account.
   * @throws An error if an account with the same name already exists.
   */
  setAccountName(accountId, accountName) {
    const account = this.getAccountExpect(accountId);
    if (this.listMultichainAccounts().find(
      (internalAccount) => internalAccount.metadata.name === accountName && internalAccount.id !== accountId
    )) {
      throw new Error("Account name already exists");
    }
    this.update((currentState) => {
      const internalAccount = {
        ...account,
        metadata: { ...account.metadata, name: accountName }
      };
      currentState.internalAccounts.accounts[accountId] = internalAccount;
    });
  }
  /**
   * Updates the internal accounts list by retrieving normal and snap accounts,
   * removing duplicates, and updating the metadata of each account.
   *
   * @returns A Promise that resolves when the accounts have been updated.
   */
  async updateAccounts() {
    const snapAccounts = await _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _listSnapAccounts, listSnapAccounts_fn).call(this);
    const normalAccounts = await _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _listNormalAccounts, listNormalAccounts_fn).call(this);
    const keyringTypes = /* @__PURE__ */ new Map();
    const previousAccounts = this.state.internalAccounts.accounts;
    const accounts = [
      ...normalAccounts,
      ...snapAccounts
    ].reduce((internalAccountMap, internalAccount) => {
      const keyringTypeName = _chunkBYPP7G2Njs.keyringTypeToName.call(void 0, 
        internalAccount.metadata.keyring.type
      );
      const keyringAccountIndex = keyringTypes.get(keyringTypeName) ?? 0;
      if (keyringAccountIndex) {
        keyringTypes.set(keyringTypeName, keyringAccountIndex + 1);
      } else {
        keyringTypes.set(keyringTypeName, 1);
      }
      const existingAccount = previousAccounts[internalAccount.id];
      internalAccountMap[internalAccount.id] = {
        ...internalAccount,
        metadata: {
          ...internalAccount.metadata,
          name: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _populateExistingMetadata, populateExistingMetadata_fn).call(this, existingAccount?.id, "name") ?? `${keyringTypeName} ${keyringAccountIndex + 1}`,
          importTime: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _populateExistingMetadata, populateExistingMetadata_fn).call(this, existingAccount?.id, "importTime") ?? Date.now(),
          lastSelected: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _populateExistingMetadata, populateExistingMetadata_fn).call(this, existingAccount?.id, "lastSelected") ?? 0
        }
      };
      return internalAccountMap;
    }, {});
    this.update((currentState) => {
      currentState.internalAccounts.accounts = accounts;
    });
  }
  /**
   * Loads the backup state of the accounts controller.
   *
   * @param backup - The backup state to load.
   */
  loadBackup(backup) {
    if (backup.internalAccounts) {
      this.update((currentState) => {
        currentState.internalAccounts = backup.internalAccounts;
      });
    }
  }
  /**
   * Returns the next account number for a given keyring type.
   * @param keyringType - The type of keyring.
   * @param accounts - Existing accounts to check for the next available account number.
   * @returns An object containing the account prefix and index to use.
   */
  getNextAvailableAccountName(keyringType = _keyringcontroller.KeyringTypes.hd, accounts) {
    const keyringName = _chunkBYPP7G2Njs.keyringTypeToName.call(void 0, keyringType);
    const keyringAccounts = _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _getAccountsByKeyringType, getAccountsByKeyringType_fn).call(this, keyringType, accounts);
    const lastDefaultIndexUsedForKeyringType = keyringAccounts.reduce(
      (maxInternalAccountIndex, internalAccount) => {
        const match = new RegExp(`${keyringName} ([0-9]+)$`, "u").exec(
          internalAccount.metadata.name
        );
        if (match) {
          const internalAccountIndex = parseInt(match[1], 10);
          return Math.max(maxInternalAccountIndex, internalAccountIndex);
        }
        return maxInternalAccountIndex;
      },
      0
    );
    const index = Math.max(
      keyringAccounts.length + 1,
      // ESLint is confused; this is a number.
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      lastDefaultIndexUsedForKeyringType + 1
    );
    return `${keyringName} ${index}`;
  }
};
_generateInternalAccountForNonSnapAccount = new WeakSet();
generateInternalAccountForNonSnapAccount_fn = function(address, type) {
  return {
    id: _chunkBYPP7G2Njs.getUUIDFromAddressOfNormalAccount.call(void 0, address),
    address,
    options: {},
    methods: [
      _keyringapi.EthMethod.PersonalSign,
      _keyringapi.EthMethod.Sign,
      _keyringapi.EthMethod.SignTransaction,
      _keyringapi.EthMethod.SignTypedDataV1,
      _keyringapi.EthMethod.SignTypedDataV3,
      _keyringapi.EthMethod.SignTypedDataV4
    ],
    type: _keyringapi.EthAccountType.Eoa,
    metadata: {
      name: "",
      importTime: Date.now(),
      keyring: {
        type
      }
    }
  };
};
_listSnapAccounts = new WeakSet();
listSnapAccounts_fn = async function() {
  const [snapKeyring] = this.messagingSystem.call(
    "KeyringController:getKeyringsByType",
    _ethsnapkeyring.SnapKeyring.type
  );
  if (!snapKeyring) {
    return [];
  }
  const snapAccounts = snapKeyring.listAccounts();
  return snapAccounts;
};
_listNormalAccounts = new WeakSet();
listNormalAccounts_fn = async function() {
  const addresses = await this.messagingSystem.call(
    "KeyringController:getAccounts"
  );
  const internalAccounts = [];
  for (const address of addresses) {
    const keyring = await this.messagingSystem.call(
      "KeyringController:getKeyringForAccount",
      address
    );
    const keyringType = keyring.type;
    if (!_chunkBYPP7G2Njs.isNormalKeyringType.call(void 0, keyringType)) {
      continue;
    }
    const id = _chunkBYPP7G2Njs.getUUIDFromAddressOfNormalAccount.call(void 0, address);
    internalAccounts.push({
      id,
      address,
      options: {},
      methods: [
        _keyringapi.EthMethod.PersonalSign,
        _keyringapi.EthMethod.Sign,
        _keyringapi.EthMethod.SignTransaction,
        _keyringapi.EthMethod.SignTypedDataV1,
        _keyringapi.EthMethod.SignTypedDataV3,
        _keyringapi.EthMethod.SignTypedDataV4
      ],
      type: _keyringapi.EthAccountType.Eoa,
      metadata: {
        name: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _populateExistingMetadata, populateExistingMetadata_fn).call(this, id, "name") ?? "",
        importTime: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _populateExistingMetadata, populateExistingMetadata_fn).call(this, id, "importTime") ?? Date.now(),
        lastSelected: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _populateExistingMetadata, populateExistingMetadata_fn).call(this, id, "lastSelected") ?? 0,
        keyring: {
          type: keyring.type
        }
      }
    });
  }
  return internalAccounts;
};
_handleOnKeyringStateChange = new WeakSet();
handleOnKeyringStateChange_fn = function(keyringState) {
  if (keyringState.isUnlocked && keyringState.keyrings.length > 0) {
    const updatedNormalKeyringAddresses = [];
    const updatedSnapKeyringAddresses = [];
    for (const keyring of keyringState.keyrings) {
      if (keyring.type === _keyringcontroller.KeyringTypes.snap) {
        updatedSnapKeyringAddresses.push(
          ...keyring.accounts.map((address) => {
            return {
              address,
              type: keyring.type
            };
          })
        );
      } else {
        updatedNormalKeyringAddresses.push(
          ...keyring.accounts.map((address) => {
            return {
              address,
              type: keyring.type
            };
          })
        );
      }
    }
    const { previousNormalInternalAccounts, previousSnapInternalAccounts } = this.listMultichainAccounts().reduce(
      (accumulator, account) => {
        if (account.metadata.keyring.type === _keyringcontroller.KeyringTypes.snap) {
          accumulator.previousSnapInternalAccounts.push(account);
        } else {
          accumulator.previousNormalInternalAccounts.push(account);
        }
        return accumulator;
      },
      {
        previousNormalInternalAccounts: [],
        previousSnapInternalAccounts: []
      }
    );
    const addedAccounts = [];
    const deletedAccounts = [];
    for (const account of updatedNormalKeyringAddresses) {
      if (!this.state.internalAccounts.accounts[_chunkBYPP7G2Njs.getUUIDFromAddressOfNormalAccount.call(void 0, account.address)]) {
        addedAccounts.push(account);
      }
    }
    for (const account of updatedSnapKeyringAddresses) {
      if (!previousSnapInternalAccounts.find(
        (internalAccount) => internalAccount.address.toLowerCase() === account.address.toLowerCase()
      )) {
        addedAccounts.push(account);
      }
    }
    for (const account of previousNormalInternalAccounts) {
      if (!updatedNormalKeyringAddresses.find(
        ({ address }) => address.toLowerCase() === account.address.toLowerCase()
      )) {
        deletedAccounts.push(account);
      }
    }
    for (const account of previousSnapInternalAccounts) {
      if (!updatedSnapKeyringAddresses.find(
        ({ address }) => address.toLowerCase() === account.address.toLowerCase()
      )) {
        deletedAccounts.push(account);
      }
    }
    this.update((currentState) => {
      if (deletedAccounts.length > 0) {
        for (const account of deletedAccounts) {
          currentState.internalAccounts.accounts = _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _handleAccountRemoved, handleAccountRemoved_fn).call(this, currentState.internalAccounts.accounts, account.id);
        }
      }
      if (addedAccounts.length > 0) {
        for (const account of addedAccounts) {
          currentState.internalAccounts.accounts = _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _handleNewAccountAdded, handleNewAccountAdded_fn).call(this, currentState.internalAccounts.accounts, account);
        }
      }
      const existingAccounts = Object.values(
        currentState.internalAccounts.accounts
      );
      if (!currentState.internalAccounts.accounts[this.state.internalAccounts.selectedAccount]) {
        if (existingAccounts.length === 0) {
          currentState.internalAccounts.selectedAccount = "";
          return;
        }
        const [accountToSelect] = existingAccounts.sort(
          (accountA, accountB) => {
            return (accountB.metadata.lastSelected ?? 0) - (accountA.metadata.lastSelected ?? 0);
          }
        );
        currentState.internalAccounts.selectedAccount = accountToSelect.id;
        currentState.internalAccounts.accounts[accountToSelect.id].metadata.lastSelected = _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _getLastSelectedIndex, getLastSelectedIndex_fn).call(this);
        _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _publishAccountChangeEvent, publishAccountChangeEvent_fn).call(this, accountToSelect);
      }
    });
  }
};
_handleOnSnapStateChange = new WeakSet();
handleOnSnapStateChange_fn = function(snapState) {
  const { snaps } = snapState;
  const accounts = this.listMultichainAccounts().filter(
    (account) => account.metadata.snap
  );
  this.update((currentState) => {
    accounts.forEach((account) => {
      const currentAccount = currentState.internalAccounts.accounts[account.id];
      if (currentAccount.metadata.snap) {
        const snapId = currentAccount.metadata.snap.id;
        const storedSnap = snaps[snapId];
        if (storedSnap) {
          currentAccount.metadata.snap.enabled = storedSnap.enabled && !storedSnap.blocked;
        }
      }
    });
  });
};
_getAccountsByKeyringType = new WeakSet();
getAccountsByKeyringType_fn = function(keyringType, accounts) {
  return (accounts ?? this.listMultichainAccounts()).filter(
    (internalAccount) => {
      if (keyringType === _keyringcontroller.KeyringTypes.hd || keyringType === _keyringcontroller.KeyringTypes.simple) {
        return internalAccount.metadata.keyring.type === _keyringcontroller.KeyringTypes.hd || internalAccount.metadata.keyring.type === _keyringcontroller.KeyringTypes.simple;
      }
      return internalAccount.metadata.keyring.type === keyringType;
    }
  );
};
_getLastSelectedAccount = new WeakSet();
getLastSelectedAccount_fn = function(accounts) {
  return accounts.reduce((prevAccount, currentAccount) => {
    if (
      // When the account is added, lastSelected will be set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      currentAccount.metadata.lastSelected > // When the account is added, lastSelected will be set
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      prevAccount.metadata.lastSelected
    ) {
      return currentAccount;
    }
    return prevAccount;
  }, accounts[0]);
};
_isAccountCompatibleWithChain = new WeakSet();
isAccountCompatibleWithChain_fn = function(account, chainId) {
  return account.type.startsWith(_utils.parseCaipChainId.call(void 0, chainId).namespace);
};
_getLastSelectedIndex = new WeakSet();
getLastSelectedIndex_fn = function() {
  return Date.now();
};
_handleNewAccountAdded = new WeakSet();
handleNewAccountAdded_fn = function(accountsState, account) {
  let newAccount;
  if (account.type !== _keyringcontroller.KeyringTypes.snap) {
    newAccount = _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _generateInternalAccountForNonSnapAccount, generateInternalAccountForNonSnapAccount_fn).call(this, account.address, account.type);
  } else {
    const [snapKeyring] = this.messagingSystem.call(
      "KeyringController:getKeyringsByType",
      _ethsnapkeyring.SnapKeyring.type
    );
    newAccount = snapKeyring.getAccountByAddress(
      account.address
    );
    if (!newAccount) {
      return accountsState;
    }
  }
  const isFirstAccount = Object.keys(accountsState).length === 0;
  const accountName = this.getNextAvailableAccountName(
    newAccount.metadata.keyring.type,
    Object.values(accountsState)
  );
  const newAccountWithUpdatedMetadata = {
    ...newAccount,
    metadata: {
      ...newAccount.metadata,
      name: accountName,
      importTime: Date.now(),
      lastSelected: isFirstAccount ? _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _getLastSelectedIndex, getLastSelectedIndex_fn).call(this) : 0
    }
  };
  accountsState[newAccount.id] = newAccountWithUpdatedMetadata;
  this.messagingSystem.publish(
    "AccountsController:accountAdded",
    newAccountWithUpdatedMetadata
  );
  return accountsState;
};
_publishAccountChangeEvent = new WeakSet();
publishAccountChangeEvent_fn = function(account) {
  if (_keyringapi.isEvmAccountType.call(void 0, account.type)) {
    this.messagingSystem.publish(
      "AccountsController:selectedEvmAccountChange",
      account
    );
  }
  this.messagingSystem.publish(
    "AccountsController:selectedAccountChange",
    account
  );
};
_handleAccountRemoved = new WeakSet();
handleAccountRemoved_fn = function(accountsState, accountId) {
  delete accountsState[accountId];
  this.messagingSystem.publish(
    "AccountsController:accountRemoved",
    accountId
  );
  return accountsState;
};
_populateExistingMetadata = new WeakSet();
populateExistingMetadata_fn = function(accountId, metadataKey, account) {
  const internalAccount = account ?? this.getAccount(accountId);
  return internalAccount ? internalAccount.metadata[metadataKey] : void 0;
};
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    `${controllerName}:setSelectedAccount`,
    this.setSelectedAccount.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:listAccounts`,
    this.listAccounts.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:listMultichainAccounts`,
    this.listMultichainAccounts.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:setAccountName`,
    this.setAccountName.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:updateAccounts`,
    this.updateAccounts.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:getSelectedAccount`,
    this.getSelectedAccount.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:getSelectedMultichainAccount`,
    this.getSelectedMultichainAccount.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:getAccountByAddress`,
    this.getAccountByAddress.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:getNextAvailableAccountName`,
    this.getNextAvailableAccountName.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `AccountsController:getAccount`,
    this.getAccount.bind(this)
  );
};




exports.EMPTY_ACCOUNT = EMPTY_ACCOUNT; exports.AccountsController = AccountsController;
//# sourceMappingURL=chunk-EOE5SAME.js.map