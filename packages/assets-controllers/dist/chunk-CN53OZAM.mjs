import {
  ERC721Standard
} from "./chunk-3QDXAE2D.mjs";
import {
  ERC20Standard
} from "./chunk-S5CFNNOM.mjs";
import {
  ERC1155Standard
} from "./chunk-KPBNX6GP.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/AssetsContractController.ts
import { Contract } from "@ethersproject/contracts";
import { Web3Provider } from "@ethersproject/providers";
import { IPFS_DEFAULT_GATEWAY_URL } from "@metamask/controller-utils";
import { getKnownPropertyNames } from "@metamask/utils";
import abiSingleCallBalancesContract from "single-call-balance-checker-abi";
var SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID = {
  ["0x1" /* mainnet */]: "0xb1f8e55c7f64d203c1400b9d8555d050f94adf39",
  ["0x38" /* bsc */]: "0x2352c63A83f9Fd126af8676146721Fa00924d7e4",
  ["0x89" /* polygon */]: "0x2352c63A83f9Fd126af8676146721Fa00924d7e4",
  ["0xa86a" /* avax */]: "0xD023D153a0DFa485130ECFdE2FAA7e612EF94818",
  ["0x4e454152" /* aurora */]: "0x1286415D333855237f89Df27D388127181448538",
  ["0xe704" /* linea_goerli */]: "0x10dAd7Ca3921471f616db788D9300DC97Db01783",
  ["0xe708" /* linea_mainnet */]: "0xF62e6a41561b3650a69Bb03199C735e3E3328c0D",
  ["0xa4b1" /* arbitrum */]: "0x151E24A486D7258dd7C33Fb67E4bB01919B7B32c",
  ["0xa" /* optimism */]: "0xB1c568e9C3E6bdaf755A60c7418C269eb11524FC",
  ["0x2105" /* base */]: "0x6AA75276052D96696134252587894ef5FFA520af",
  ["0x144" /* zksync */]: "0x458fEd3144680a5b8bcfaa0F9594aa19B4Ea2D34",
  ["0x19" /* cronos */]: "0x768ca200f0fc702ac9ea502498c18f5eff176378",
  ["0xa4ec" /* celo */]: "0x6aa75276052d96696134252587894ef5ffa520af",
  ["0x64" /* gnosis */]: "0x6aa75276052d96696134252587894ef5ffa520af",
  ["0xfa" /* fantom */]: "0x6aa75276052d96696134252587894ef5ffa520af",
  ["0x44d" /* polygon_zkevm */]: "0x6aa75276052d96696134252587894ef5ffa520af",
  ["0x504" /* moonbeam */]: "0x6aa75276052d96696134252587894ef5ffa520af",
  ["0x505" /* moonriver */]: "0x6aa75276052d96696134252587894ef5ffa520af"
};
var MISSING_PROVIDER_ERROR = "AssetsContractController failed to set the provider correctly. A provider must be set for this method to be available";
var name = "AssetsContractController";
var _provider, _ipfsGateway, _chainId, _registerActionHandlers, registerActionHandlers_fn, _registerEventSubscriptions, registerEventSubscriptions_fn, _getCorrectProvider, getCorrectProvider_fn, _getCorrectChainId, getCorrectChainId_fn;
var AssetsContractController = class {
  /**
   * Creates a AssetsContractController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messenger.
   * @param options.chainId - The chain ID of the current network.
   */
  constructor({
    messenger,
    chainId: initialChainId
  }) {
    // TODO: Expand into base-controller utility function that batch registers action handlers.
    __privateAdd(this, _registerActionHandlers);
    __privateAdd(this, _registerEventSubscriptions);
    /**
     * Get the relevant provider instance.
     *
     * @param networkClientId - Network Client ID.
     * @returns Web3Provider instance.
     */
    __privateAdd(this, _getCorrectProvider);
    /**
     * Get the relevant chain ID.
     *
     * @param networkClientId - Network Client ID used to get the provider.
     * @returns Hex chain ID.
     */
    __privateAdd(this, _getCorrectChainId);
    __privateAdd(this, _provider, void 0);
    __privateAdd(this, _ipfsGateway, void 0);
    __privateAdd(this, _chainId, void 0);
    this.messagingSystem = messenger;
    __privateSet(this, _provider, void 0);
    __privateSet(this, _ipfsGateway, IPFS_DEFAULT_GATEWAY_URL);
    __privateSet(this, _chainId, initialChainId);
    __privateMethod(this, _registerActionHandlers, registerActionHandlers_fn).call(this);
    __privateMethod(this, _registerEventSubscriptions, registerEventSubscriptions_fn).call(this);
  }
  /**
   * Sets a new provider.
   *
   * @param provider - Provider used to create a new underlying Web3 instance
   */
  setProvider(provider) {
    __privateSet(this, _provider, provider);
  }
  get ipfsGateway() {
    return __privateGet(this, _ipfsGateway);
  }
  get chainId() {
    return __privateGet(this, _chainId);
  }
  /**
   * Get a ERC20Standard instance using the relevant provider instance.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns ERC20Standard instance.
   */
  getERC20Standard(networkClientId) {
    const provider = __privateMethod(this, _getCorrectProvider, getCorrectProvider_fn).call(this, networkClientId);
    return new ERC20Standard(provider);
  }
  /**
   * Get a ERC721Standard instance using the relevant provider instance.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns ERC721Standard instance.
   */
  getERC721Standard(networkClientId) {
    const provider = __privateMethod(this, _getCorrectProvider, getCorrectProvider_fn).call(this, networkClientId);
    return new ERC721Standard(provider);
  }
  /**
   * Get a ERC1155Standard instance using the relevant provider instance.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns ERC1155Standard instance.
   */
  getERC1155Standard(networkClientId) {
    const provider = __privateMethod(this, _getCorrectProvider, getCorrectProvider_fn).call(this, networkClientId);
    return new ERC1155Standard(provider);
  }
  /**
   * Get balance or count for current account on specific asset contract.
   *
   * @param address - Asset ERC20 contract address.
   * @param selectedAddress - Current account public address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
   */
  async getERC20BalanceOf(address, selectedAddress, networkClientId) {
    const erc20Standard = this.getERC20Standard(networkClientId);
    return erc20Standard.getBalanceOf(address, selectedAddress);
  }
  /**
   * Query for the decimals for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'decimals'.
   */
  async getERC20TokenDecimals(address, networkClientId) {
    const erc20Standard = this.getERC20Standard(networkClientId);
    return erc20Standard.getTokenDecimals(address);
  }
  /**
   * Query for the name for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'decimals'.
   */
  async getERC20TokenName(address, networkClientId) {
    const erc20Standard = this.getERC20Standard(networkClientId);
    return erc20Standard.getTokenName(address);
  }
  /**
   * Enumerate assets assigned to an owner.
   *
   * @param address - ERC721 asset contract address.
   * @param selectedAddress - Current account public address.
   * @param index - An NFT counter less than `balanceOf(selectedAddress)`.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  async getERC721NftTokenId(address, selectedAddress, index, networkClientId) {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getNftTokenId(address, selectedAddress, index);
  }
  /**
   * Enumerate assets assigned to an owner.
   *
   * @param tokenAddress - ERC721 asset contract address.
   * @param userAddress - Current account public address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to an object containing the token standard and a set of details which depend on which standard the token supports.
   */
  async getTokenStandardAndDetails(tokenAddress, userAddress, tokenId, networkClientId) {
    __privateMethod(this, _getCorrectProvider, getCorrectProvider_fn).call(this, networkClientId);
    try {
      const erc721Standard = this.getERC721Standard(networkClientId);
      return {
        ...await erc721Standard.getDetails(
          tokenAddress,
          __privateGet(this, _ipfsGateway),
          tokenId
        )
      };
    } catch {
    }
    try {
      const erc1155Standard = this.getERC1155Standard(networkClientId);
      return {
        ...await erc1155Standard.getDetails(
          tokenAddress,
          __privateGet(this, _ipfsGateway),
          tokenId
        )
      };
    } catch {
    }
    try {
      const erc20Standard = this.getERC20Standard(networkClientId);
      return {
        ...await erc20Standard.getDetails(tokenAddress, userAddress)
      };
    } catch {
    }
    throw new Error("Unable to determine contract standard");
  }
  /**
   * Query for tokenURI for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getERC721TokenURI(address, tokenId, networkClientId) {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getTokenURI(address, tokenId);
  }
  /**
   * Query for name for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'name'.
   */
  async getERC721AssetName(address, networkClientId) {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getAssetName(address);
  }
  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'symbol'.
   */
  async getERC721AssetSymbol(address, networkClientId) {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getAssetSymbol(address);
  }
  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the owner address.
   */
  async getERC721OwnerOf(address, tokenId, networkClientId) {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getOwnerOf(address, tokenId);
  }
  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getERC1155TokenURI(address, tokenId, networkClientId) {
    const erc1155Standard = this.getERC1155Standard(networkClientId);
    return erc1155Standard.getTokenURI(address, tokenId);
  }
  /**
   * Query for balance of a given ERC 1155 token.
   *
   * @param userAddress - Wallet public address.
   * @param nftAddress - ERC1155 asset contract address.
   * @param nftId - ERC1155 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'balanceOf'.
   */
  async getERC1155BalanceOf(userAddress, nftAddress, nftId, networkClientId) {
    const erc1155Standard = this.getERC1155Standard(networkClientId);
    return erc1155Standard.getBalanceOf(nftAddress, userAddress, nftId);
  }
  /**
   * Transfer single ERC1155 token.
   *
   * @param nftAddress - ERC1155 token address.
   * @param senderAddress - ERC1155 token sender.
   * @param recipientAddress - ERC1155 token recipient.
   * @param nftId - ERC1155 token id.
   * @param qty - Quantity of tokens to be sent.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'transferSingle' ERC1155 token.
   */
  async transferSingleERC1155(nftAddress, senderAddress, recipientAddress, nftId, qty, networkClientId) {
    const erc1155Standard = this.getERC1155Standard(networkClientId);
    return erc1155Standard.transferSingle(
      nftAddress,
      senderAddress,
      recipientAddress,
      nftId,
      qty
    );
  }
  /**
   * Get the token balance for a list of token addresses in a single call. Only non-zero balances
   * are returned.
   *
   * @param selectedAddress - The address to check token balances for.
   * @param tokensToDetect - The token addresses to detect balances for.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns The list of non-zero token balances.
   */
  async getBalancesInSingleCall(selectedAddress, tokensToDetect, networkClientId) {
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, networkClientId);
    const provider = __privateMethod(this, _getCorrectProvider, getCorrectProvider_fn).call(this, networkClientId);
    if (!((id) => id in SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID)(chainId)) {
      return {};
    }
    const contractAddress = SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID[chainId];
    const contract = new Contract(
      contractAddress,
      abiSingleCallBalancesContract,
      provider
    );
    const result = await contract.balances([selectedAddress], tokensToDetect);
    const nonZeroBalances = {};
    if (result.length > 0) {
      tokensToDetect.forEach((tokenAddress, index) => {
        const balance = result[index];
        if (String(balance) !== "0") {
          nonZeroBalances[tokenAddress] = balance;
        }
      });
    }
    return nonZeroBalances;
  }
};
_provider = new WeakMap();
_ipfsGateway = new WeakMap();
_chainId = new WeakMap();
_registerActionHandlers = new WeakSet();
registerActionHandlers_fn = function() {
  const methodsExcludedFromMessenger = [
    "constructor",
    "messagingSystem",
    "setProvider",
    "provider",
    "ipfsGateway",
    "chainId"
  ];
  getKnownPropertyNames(Object.getPrototypeOf(this)).forEach(
    (method) => {
      if (((key) => !methodsExcludedFromMessenger.find((e) => e === key) && typeof this[key] === "function")(method)) {
        this.messagingSystem.registerActionHandler(
          `${name}:${method}`,
          // TODO: Write a generic for-loop implementation that iterates over an input union type in tandem with the input array.
          // @ts-expect-error Both assigned argument and assignee parameter are using the entire union type for `method` instead of the type for the current element
          this[method].bind(this)
        );
      }
    }
  );
};
_registerEventSubscriptions = new WeakSet();
registerEventSubscriptions_fn = function() {
  this.messagingSystem.subscribe(
    `PreferencesController:stateChange`,
    ({ ipfsGateway }) => {
      __privateSet(this, _ipfsGateway, ipfsGateway);
    }
  );
  this.messagingSystem.subscribe(
    `NetworkController:networkDidChange`,
    ({ selectedNetworkClientId }) => {
      const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, selectedNetworkClientId);
      if (__privateGet(this, _chainId) !== chainId) {
        __privateSet(this, _chainId, chainId);
        __privateSet(this, _provider, __privateMethod(this, _getCorrectProvider, getCorrectProvider_fn).call(this));
      }
    }
  );
};
_getCorrectProvider = new WeakSet();
getCorrectProvider_fn = function(networkClientId) {
  const provider = networkClientId ? this.messagingSystem.call(
    `NetworkController:getNetworkClientById`,
    networkClientId
  ).provider : this.messagingSystem.call("NetworkController:getSelectedNetworkClient")?.provider ?? __privateGet(this, _provider);
  if (provider === void 0) {
    throw new Error(MISSING_PROVIDER_ERROR);
  }
  return new Web3Provider(provider);
};
_getCorrectChainId = new WeakSet();
getCorrectChainId_fn = function(networkClientId) {
  if (networkClientId) {
    const networkClientConfiguration = this.messagingSystem.call(
      "NetworkController:getNetworkConfigurationByNetworkClientId",
      networkClientId
    );
    if (networkClientConfiguration) {
      return networkClientConfiguration.chainId;
    }
  }
  const { selectedNetworkClientId } = this.messagingSystem.call(
    "NetworkController:getState"
  );
  const networkClient = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  return networkClient.configuration?.chainId ?? __privateGet(this, _chainId);
};
var AssetsContractController_default = AssetsContractController;

export {
  SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID,
  MISSING_PROVIDER_ERROR,
  AssetsContractController,
  AssetsContractController_default
};
//# sourceMappingURL=chunk-CN53OZAM.mjs.map