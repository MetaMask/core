var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/EnsController.ts
import { Web3Provider } from "@ethersproject/providers";
import { BaseController } from "@metamask/base-controller";
import {
  normalizeEnsName,
  isValidHexAddress,
  isSafeDynamicKey,
  toChecksumHexAddress,
  CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP,
  convertHexToDecimal,
  toHex
} from "@metamask/controller-utils";
import { createProjectLogger } from "@metamask/utils";
import { toASCII } from "punycode/";
var log = createProjectLogger("ens-controller");
var name = "EnsController";
var DEFAULT_ENS_NETWORK_MAP = {
  // Mainnet
  1: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // Ropsten
  3: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // Rinkeby
  4: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // Goerli
  5: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // Holesky
  17e3: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  // Sepolia
  11155111: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"
};
var metadata = {
  ensEntries: { persist: true, anonymous: false },
  ensResolutionsByAddress: { persist: true, anonymous: false }
};
var defaultState = {
  ensEntries: {},
  ensResolutionsByAddress: {}
};
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
var ZERO_X_ERROR_ADDRESS = "0x";
var _ethProvider, _getChainEnsSupport, getChainEnsSupport_fn;
var EnsController = class extends BaseController {
  /**
   * Creates an EnsController instance.
   *
   * @param options - Constructor options.
   * @param options.registriesByChainId - Map between chain IDs and ENS contract addresses.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.provider - Provider instance.
   * @param options.onNetworkDidChange - Allows subscribing to network controller networkDidChange events.
   */
  constructor({
    registriesByChainId = DEFAULT_ENS_NETWORK_MAP,
    messenger,
    state = {},
    provider,
    onNetworkDidChange
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...defaultState,
        ensEntries: Object.fromEntries(
          Object.entries(registriesByChainId).map(([chainId, address]) => [
            toHex(chainId),
            {
              ".": {
                address,
                chainId: toHex(chainId),
                ensName: "."
              }
            }
          ])
        ),
        ...state
      }
    });
    /**
     * Check if the chain supports ENS.
     *
     * @param chainId - chain id.
     * @returns Boolean indicating if the chain supports ENS.
     */
    __privateAdd(this, _getChainEnsSupport);
    __privateAdd(this, _ethProvider, null);
    if (provider && onNetworkDidChange) {
      onNetworkDidChange(({ selectedNetworkClientId }) => {
        this.resetState();
        const selectedNetworkClient = this.messagingSystem.call(
          "NetworkController:getNetworkClientById",
          selectedNetworkClientId
        );
        const currentChainId = selectedNetworkClient.configuration.chainId;
        if (__privateMethod(this, _getChainEnsSupport, getChainEnsSupport_fn).call(this, currentChainId)) {
          __privateSet(this, _ethProvider, new Web3Provider(provider, {
            chainId: convertHexToDecimal(currentChainId),
            name: CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP[currentChainId],
            ensAddress: registriesByChainId[parseInt(currentChainId, 16)]
          }));
        } else {
          __privateSet(this, _ethProvider, null);
        }
      });
    }
  }
  /**
   * Clears ensResolutionsByAddress state property.
   */
  resetState() {
    this.update((currentState) => {
      currentState.ensResolutionsByAddress = {};
    });
  }
  /**
   * Remove all chain Ids and ENS entries from state.
   */
  clear() {
    this.update((state) => {
      state.ensEntries = {};
    });
  }
  /**
   * Delete an ENS entry.
   *
   * @param chainId - Parent chain of the ENS entry to delete.
   * @param ensName - Name of the ENS entry to delete.
   * @returns Boolean indicating if the entry was deleted.
   */
  delete(chainId, ensName) {
    const normalizedEnsName = normalizeEnsName(ensName);
    if (!isSafeDynamicKey(chainId) || !normalizedEnsName || !this.state.ensEntries[chainId] || !this.state.ensEntries[chainId][normalizedEnsName]) {
      return false;
    }
    this.update((state) => {
      delete state.ensEntries[chainId][normalizedEnsName];
      if (Object.keys(state.ensEntries[chainId]).length === 0) {
        delete state.ensEntries[chainId];
      }
    });
    return true;
  }
  /**
   * Retrieve a DNS entry.
   *
   * @param chainId - Parent chain of the ENS entry to retrieve.
   * @param ensName - Name of the ENS entry to retrieve.
   * @returns The EnsEntry or null if it does not exist.
   */
  get(chainId, ensName) {
    const normalizedEnsName = normalizeEnsName(ensName);
    return !!normalizedEnsName && this.state.ensEntries[chainId] ? this.state.ensEntries[chainId][normalizedEnsName] || null : null;
  }
  /**
   * Add or update an ENS entry by chainId and ensName.
   *
   * A null address indicates that the ENS name does not resolve.
   *
   * @param chainId - Id of the associated chain.
   * @param ensName - The ENS name.
   * @param address - Associated address (or null) to add or update.
   * @returns Boolean indicating if the entry was set.
   */
  set(chainId, ensName, address) {
    if (!Number.isInteger(Number.parseInt(chainId, 10)) || !ensName || typeof ensName !== "string" || address && !isValidHexAddress(address)) {
      throw new Error(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Invalid ENS entry: { chainId:${chainId}, ensName:${ensName}, address:${address}}`
      );
    }
    const normalizedEnsName = normalizeEnsName(ensName);
    if (!normalizedEnsName) {
      throw new Error(`Invalid ENS name: ${ensName}`);
    }
    const normalizedAddress = address ? toChecksumHexAddress(address) : null;
    const subState = this.state.ensEntries[chainId];
    if (subState?.[normalizedEnsName] && subState[normalizedEnsName].address === normalizedAddress) {
      return false;
    }
    this.update((state) => {
      state.ensEntries = {
        ...this.state.ensEntries,
        [chainId]: {
          ...this.state.ensEntries[chainId],
          [normalizedEnsName]: {
            address: normalizedAddress,
            chainId,
            ensName: normalizedEnsName
          }
        }
      };
    });
    return true;
  }
  /**
   * Resolve ens by address.
   *
   * @param nonChecksummedAddress - address
   * @returns ens resolution
   */
  async reverseResolveAddress(nonChecksummedAddress) {
    if (!__privateGet(this, _ethProvider)) {
      return void 0;
    }
    const address = toChecksumHexAddress(nonChecksummedAddress);
    if (this.state.ensResolutionsByAddress[address]) {
      return this.state.ensResolutionsByAddress[address];
    }
    let domain;
    try {
      domain = await __privateGet(this, _ethProvider).lookupAddress(address);
    } catch (error) {
      log(error);
      return void 0;
    }
    if (!domain) {
      return void 0;
    }
    let registeredAddress;
    try {
      registeredAddress = await __privateGet(this, _ethProvider).resolveName(domain);
    } catch (error) {
      log(error);
      return void 0;
    }
    if (!registeredAddress) {
      return void 0;
    }
    if (registeredAddress === ZERO_ADDRESS || registeredAddress === ZERO_X_ERROR_ADDRESS) {
      return void 0;
    }
    if (toChecksumHexAddress(registeredAddress) !== address) {
      return void 0;
    }
    this.update((state) => {
      state.ensResolutionsByAddress[address] = toASCII(domain);
    });
    return domain;
  }
};
_ethProvider = new WeakMap();
_getChainEnsSupport = new WeakSet();
getChainEnsSupport_fn = function(chainId) {
  return Boolean(this.state.ensEntries[chainId]);
};
var EnsController_default = EnsController;

export {
  DEFAULT_ENS_NETWORK_MAP,
  EnsController,
  EnsController_default
};
//# sourceMappingURL=chunk-QYSGUYCU.mjs.map