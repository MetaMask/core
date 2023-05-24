import EventEmitter from 'events';
import log from 'loglevel';
import {
  PersonalMessageManager,
  TypedMessageManager,
} from '@metamask/message-manager';
import { CUSTODIAN_TYPES, MmiConfigurationController } from '@metamask-institutional/custody-keyring';
import { TransactionUpdateController } from '@metamask-institutional/transaction-update';
import { CustodyController } from '@metamask-institutional/custody-controller';
import { InstitutionalFeaturesController } from '@metamask-institutional/institutional-features';
import {
  updateCustodianTransactions,
  custodianEventHandlerFactory,
} from '@metamask-institutional/extension';
import {
  REFRESH_TOKEN_CHANGE_EVENT,
  INTERACTIVE_REPLACEMENT_TOKEN_CHANGE_EVENT,
} from '@metamask-institutional/sdk';
import { handleMmiPortfolio } from '@metamask-institutional/portfolio-dashboard';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import { PreferencesController } from '@metamask/preferences-controller';
import { TransactionMeta } from '@metamask/transaction-controller';

import { CHAIN_IDS, FINALIZED_TRANSACTION_STATUSES } from './transaction';
import { MMIControllerOptions } from './MMIControllerOptions';

const BUILD_QUOTE_ROUTE = '/swaps/build-quote';
const CONNECT_HARDWARE_ROUTE = '/new-account/connect';

export default class MMIController extends EventEmitter {

  public mmiConfigurationController: MmiConfigurationController;
  public keyringController: any;
  public txController: any;
  public securityProviderRequest: any;
  public appStateController: any;
  public addKeyringIfNotExists: any;
  public getState: any;
  public getPendingNonce: any;
  public accountTracker: any;
  public preferencesController: PreferencesController
  public transactionUpdateController: TransactionUpdateController;
  public custodyController: CustodyController;
  public institutionalFeaturesController: InstitutionalFeaturesController;

  public typedMessageManager: TypedMessageManager;
  public personalMessageManager: PersonalMessageManager;

  public metaMetricsController: any;
  public networkController: any;
  public platform: any;
  public extension: any;

  constructor(
    opts: MMIControllerOptions,
    preferencesController: PreferencesController,
    mmiConfigurationController: MmiConfigurationController,
    custodyController: CustodyController,
    institutionalFeaturesController: InstitutionalFeaturesController,
    typedMessageManager: TypedMessageManager,
    personalMessageManager: PersonalMessageManager,
    ) {
    super();

    this.mmiConfigurationController = mmiConfigurationController;
    this.keyringController = opts.keyringController;
    this.txController = opts.txController;
    this.securityProviderRequest = opts.securityProviderRequest;

    this.typedMessageManager = typedMessageManager;
    this.personalMessageManager = personalMessageManager;
    
    this.preferencesController = preferencesController;

    this.appStateController = opts.appStateController;
    
    this.transactionUpdateController = opts.transactionUpdateController;
    this.custodyController = custodyController;
    this.institutionalFeaturesController = institutionalFeaturesController;
    this.addKeyringIfNotExists = opts.addKeyringIfNotExists;
    this.getState = opts.getState;
    this.getPendingNonce = opts.getPendingNonce;
    this.accountTracker = opts.accountTracker;
    this.metaMetricsController = opts.metaMetricsController;
    this.networkController = opts.networkController;
    this.platform = opts.platform;
    this.extension = opts.extension;

    // Prepare event listener after transactionUpdateController gets initiated
    this.transactionUpdateController.prepareEventListener(
      this.custodianEventHandlerFactory.bind(this),
    );

    // Get configuration from MMIConfig controller
    if (!process.env.IN_TEST) {
      this.mmiConfigurationController.storeConfiguration().then(() => {
        // This must happen after the configuration is fetched
        // Otherwise websockets will always be disabled in the first run

        this.transactionUpdateController.subscribeToEvents();
      });
    }
  }

  async persistKeyringsAfterRefreshTokenChange() {
    this.keyringController.persistAllKeyrings();
  }

  async trackTransactionEventFromCustodianEvent(txMeta: TransactionMeta, event: string) {
    this.txController._trackTransactionMetricsEvent(txMeta, event);
  }

  custodianEventHandlerFactory() {
    return custodianEventHandlerFactory({
      log,
      FINALIZED_TRANSACTION_STATUSES,
      getState: () => this.getState(),
      addKeyringIfNotExists: (type: string) => this.addKeyringIfNotExists(type),
      getPendingNonce: (address) => this.getPendingNonce(address),
      setTxHash: (txId, txHash) => this.txController.setTxHash(txId, txHash),
      typedMessageManager: this.typedMessageManager,
      personalMessageManager: this.personalMessageManager,
      txStateManager: this.txController.txStateManager,
      custodyController: this.custodyController,
      // @ts-ignore
      trackTransactionEvent:
        this.trackTransactionEventFromCustodianEvent.bind(this),
    });
  }

  async storeCustodianSupportedChains(address: string) {
    const custodyType = this.custodyController.getCustodyTypeByAddress(
      toChecksumHexAddress(address),
    );
    const keyring = await this.addKeyringIfNotExists(custodyType);

    const supportedChains = await keyring.getSupportedChains(address);

    if (supportedChains?.status === 401) {
      return;
    }

    const accountDetails = this.custodyController.getAccountDetails(address);

    await this.custodyController.storeSupportedChainsForAddress(
      toChecksumHexAddress(address),
      supportedChains,
      accountDetails.custodianName,
    );
  }

  async onSubmitPassword() {
    // Create a keyring for each custodian type
    let addresses: string[] = [];
    const custodyTypes: Set<string | any> = this.custodyController.getAllCustodyTypes();
    for (const type of custodyTypes) {
      try {
        const keyring = await this.addKeyringIfNotExists(type);

        keyring.on(REFRESH_TOKEN_CHANGE_EVENT, () => {
          log.info(`Refresh token change event for ${type}`);
          this.persistKeyringsAfterRefreshTokenChange();
        });

        // Trigger this event, listen to sdk, sdk change the state and then Ui is listening for the state changed
        keyring.on(INTERACTIVE_REPLACEMENT_TOKEN_CHANGE_EVENT, (payload: {}) => {
          log.info(`Interactive refresh token change event for ${payload}`);
          this.appStateController.showInteractiveReplacementTokenBanner(
            payload,
          );
        });

        // store the supported chains for this custodian type
        const accounts = await keyring.getAccounts();
        addresses = addresses.concat(...accounts);
        for (const address of accounts) {
          try {
            await this.storeCustodianSupportedChains(address);
          } catch (error) {
            console.error(error);
            log.error('Error while unlocking extension.', error);
          }
        }

        const txList = this.txController.txStateManager.getTransactions(
          {},
          [],
          false,
        ); // Includes all transactions, but we are looping through keyrings. Currently filtering is done in updateCustodianTransactions :-/

        try {
          updateCustodianTransactions({
            keyring,
            type,
            txList,
            getPendingNonce: this.getPendingNonce.bind(this),
            txStateManager: this.txController.txStateManager,
            setTxHash: this.txController.setTxHash.bind(this.txController),
            custodyController: this.custodyController,
            transactionUpdateController: this.transactionUpdateController,
          });
        } catch (error) {
          log.error('Error doing offline transaction updates', error);
          console.error(error);
        }
      } catch (error) {
        log.error(
          `Error while unlocking extension with custody type ${type}`,
          error,
        );
        console.error(error);
      }
    }

    try {
      await this.mmiConfigurationController.storeConfiguration();
    } catch (error) {
      log.error('Error while unlocking extension.', error);
    }

    try {
      await this.transactionUpdateController.subscribeToEvents();
    } catch (error) {
      log.error('Error while unlocking extension.', error);
    }

    const mmiConfigData =
      await this.mmiConfigurationController.store.getState();

    if (
      mmiConfigData &&
      mmiConfigData.mmiConfiguration.features?.websocketApi
    ) {
      this.transactionUpdateController.getCustomerProofForAddresses(addresses);
    }

    try {
      if (this.institutionalFeaturesController.getComplianceProjectId()) {
        this.institutionalFeaturesController.startPolling();
      }
    } catch (e) {
      log.error('Failed to start Compliance polling');
      log.error(e);
    }
  }

  async connectCustodyAddresses(custodianType: string, custodianName: string, accounts: any ) {
    if (!custodianType) {
      throw new Error('No custodian');
    }

    const custodian = CUSTODIAN_TYPES[custodianType.toUpperCase()];
    if (!custodian) {
      throw new Error('No such custodian');
    }

    const newAccounts = Object.keys(accounts);

    // Check if any address is already added
    const identities = Object.keys(
      this.preferencesController.state.identities
    );
    if (newAccounts.some((address) => identities.indexOf(address) !== -1)) {
      throw new Error('Cannot import duplicate accounts');
    }

    const keyring = await this.addKeyringIfNotExists(
      custodian.keyringClass.type,
    );

    keyring.on(REFRESH_TOKEN_CHANGE_EVENT, () => {
      log.info(`Refresh token change event for ${keyring.type}`);
      this.persistKeyringsAfterRefreshTokenChange();
    });

    // Trigger this event, listen to sdk, sdk change the state and then Ui is listening for the state changed
    keyring.on(INTERACTIVE_REPLACEMENT_TOKEN_CHANGE_EVENT, (payload: {}) => {
      log.info(`Interactive refresh token change event for ${payload}`);
      this.appStateController.showInteractiveReplacementTokenBanner(payload);
    });

    if (!keyring) {
      throw new Error('Unable to get keyring');
    }
    const oldAccounts = await this.keyringController.getAccounts();

    await keyring.setSelectedAddresses(
      newAccounts.map((item) => ({
        address: toChecksumHexAddress(item),
        name: accounts[item].name,
        custodianDetails: accounts[item].custodianDetails,
        labels: accounts[item].labels,
        token: accounts[item].token,
        apiUrl: accounts[item].apiUrl,
        custodyType: custodian.keyringClass.type,
        chainId: accounts[item].chainId,
      })),
    );
    this.custodyController.setAccountDetails(
      newAccounts.map((item) => ({
        address: toChecksumHexAddress(item),
        name: accounts[item].name,
        custodianDetails: accounts[item].custodianDetails,
        labels: accounts[item].labels,
        apiUrl: accounts[item].apiUrl,
        custodyType: custodian.keyringClass.type,
        custodianName,
        chainId: accounts[item].chainId,
      })),
    );

    newAccounts.forEach(
      async () => await this.keyringController.addNewAccount(keyring),
    );

    const allAccounts = await this.keyringController.getAccounts();

    this.preferencesController.updateIdentities(allAccounts);
    const accountsToTrack = [
      ...new Set(oldAccounts.concat(allAccounts.map((a: string) => a.toLowerCase()))),
    ];

    allAccounts.forEach((address: string) => {
      if (!oldAccounts.includes(address.toLowerCase())) {
        const label = newAccounts
          .filter((item) => item.toLowerCase() === address)
          .map((item) => accounts[item].name)[0];
        this.preferencesController.setAccountLabel(address, label);
      }
    });

    this.accountTracker.syncWithAddresses(accountsToTrack);

    for (const address of newAccounts) {
      try {
        await this.storeCustodianSupportedChains(address);
      } catch (error) {
        console.error(error);
      }
    }

    this.custodyController.storeCustodyStatusMap(
      custodian.name,
      keyring.getStatusMap(),
    );

    // MMI - get a WS stream for this account
    const mmiConfigData =
      await this.mmiConfigurationController.store.getState();

    if (
      mmiConfigData &&
      mmiConfigData.mmiConfiguration.features?.websocketApi
    ) {
      this.transactionUpdateController.getCustomerProofForAddresses(
        newAccounts,
      );
    }

    return newAccounts;
  }

  async getCustodianAccounts(
    token: string,
    apiUrl: string,
    custodianType: string,
    getNonImportedAccounts: boolean,
  ) {
    let currentCustodyType;
    if (!custodianType) {
      const address = this.preferencesController.state.selectedAddress;
      currentCustodyType = this.custodyController.getCustodyTypeByAddress(
        toChecksumHexAddress(address),
      );
    }

    let keyring;

    if (custodianType) {
      const custodian = CUSTODIAN_TYPES[custodianType.toUpperCase()];
      if (!custodian) {
        throw new Error('No such custodian');
      }

      keyring = await this.addKeyringIfNotExists(custodian.keyringClass.type);
    } else if (currentCustodyType) {
      keyring = await this.addKeyringIfNotExists(currentCustodyType);
    } else {
      throw new Error('No custodian specified');
    }

    const accounts = await keyring.getCustodianAccounts(
      token,
      apiUrl,
      null,
      getNonImportedAccounts,
    );
    return accounts;
  }

  async getCustodianAccountsByAddress(token: string, apiUrl: string, address: string, custodianType: string) {
    let keyring;

    if (custodianType) {
      const custodian = CUSTODIAN_TYPES[custodianType.toUpperCase()];
      if (!custodian) {
        throw new Error('No such custodian');
      }

      keyring = await this.addKeyringIfNotExists(custodian.keyringClass.type);
    } else {
      throw new Error('No custodian specified');
    }

    const accounts = await keyring.getCustodianAccounts(token, apiUrl, address);
    return accounts;
  }

  async getCustodianTransactionDeepLink(address: string, txId: string) {
    const custodyType = this.custodyController.getCustodyTypeByAddress(
      toChecksumHexAddress(address),
    );
    const keyring = await this.addKeyringIfNotExists(custodyType);
    return keyring.getTransactionDeepLink(address, txId);
  }

  async getCustodianConfirmDeepLink(txId: string) {
    const txMeta = this.txController.txStateManager.getTransaction(txId);

    const address = txMeta.txParams.from;
    const custodyType = this.custodyController.getCustodyTypeByAddress(
      toChecksumHexAddress(address),
    );
    const keyring = await this.addKeyringIfNotExists(custodyType);
    return {
      deepLink: await keyring.getTransactionDeepLink(
        txMeta.txParams.from,
        txMeta.custodyId,
      ),
      custodyId: txMeta.custodyId,
    };
  }

  async getCustodianSignMessageDeepLink(from: string, custodyTxId: string) {
    const custodyType = this.custodyController.getCustodyTypeByAddress(
      toChecksumHexAddress(from),
    );
    const keyring = await this.addKeyringIfNotExists(custodyType);
    return keyring.getTransactionDeepLink(from, custodyTxId);
  }

  async getCustodianToken(custodianType: string) {
    let currentCustodyType;

    const address = this.preferencesController.state.selectedAddress;

    if (!custodianType) {
      const resultCustody = this.custodyController.getCustodyTypeByAddress(
        toChecksumHexAddress(address),
      );
      currentCustodyType = resultCustody;
    }
    let keyring = await this.keyringController.getKeyringsByType(
      currentCustodyType || `Custody - ${custodianType}`,
    )[0];
    if (!keyring) {
      keyring = await this.keyringController.addNewKeyring(
        currentCustodyType || `Custody - ${custodianType}`,
      );
    }
    const { authDetails } = keyring.getAccountDetails(address);
    return keyring ? authDetails.jwt || authDetails.refreshToken : '';
  }

  // Based on a custodian name, get all the tokens associated with that custodian
  async getCustodianJWTList(custodianName: string) {
    console.log('getCustodianJWTList', custodianName);

    const { identities } = this.preferencesController.state;

    const { mmiConfiguration } =
      this.mmiConfigurationController.store.getState();

    const addresses = Object.keys(identities);
    const tokenList: string[] = [];

    const { custodians } = mmiConfiguration;

    const custodian = custodians.find((item: { name: string; }) => item.name === custodianName);

    if (!custodian) {
      return [];
    }

    const keyrings = await this.keyringController.getKeyringsByType(
      `Custody - ${custodian.type}`,
    );

    for (const address of addresses) {
      for (const keyring of keyrings) {
        // Narrow down to custodian Type
        const accountDetails = keyring.getAccountDetails(address);

        if (!accountDetails) {
          log.debug(`${address} does not belong to ${custodian.type} keyring`);
          continue;
        }

        const custodyAccountDetails =
          this.custodyController.getAccountDetails(address);

        if (
          !custodyAccountDetails ||
          custodyAccountDetails.custodianName !== custodianName
        ) {
          log.debug(`${address} does not belong to ${custodianName} keyring`);
          continue;
        }

        const { authDetails } = accountDetails;

        let token;
        if (authDetails.jwt) {
          token = authDetails.jwt;
        } else if (authDetails.refreshToken) {
          token = authDetails.refreshToken;
        }

        if (!tokenList.includes(token)) {
          tokenList.push(token);
        }
      }
    }
    return tokenList;
  }

  async getAllCustodianAccountsWithToken(custodyType: string, token: string) {
    const keyring = await this.keyringController.getKeyringsByType(
      `Custody - ${custodyType}`,
    )[0];
    return keyring ? keyring.getAllAccountsWithToken(token) : [];
  }

  async setCustodianNewRefreshToken({ address, newAuthDetails }: { address: string, newAuthDetails: {
    refreshToken: string;
    refreshTokenUrl?: string;
  }}) {
    const custodyType = this.custodyController.getCustodyTypeByAddress(
      toChecksumHexAddress(address),
    );

    const keyring = await this.addKeyringIfNotExists(custodyType);

    await keyring.replaceRefreshTokenAuthDetails(address, newAuthDetails);
  }

  async handleMmiCheckIfTokenIsPresent(req: { params: {
    token: string;
    apiUrl: string;
    keyring: any;
  }}) {
    const { token, apiUrl } = req.params;
    const custodyType = 'Custody - JSONRPC'; // Only JSONRPC is supported

    // This can only work if the extension is unlocked
    await this.appStateController.getUnlockPromise(true);

    const keyring = await this.addKeyringIfNotExists(custodyType);

    return await this.custodyController.handleMmiCheckIfTokenIsPresent({
      token,
      apiUrl,
      keyring,
    });
  }

  async setMmiPortfolioCookie() {
    await this.appStateController.getUnlockPromise(true);
    const keyringAccounts = await this.keyringController.getAccounts();
    const { identities } = this.preferencesController.state;
    const { metaMetricsId } = this.metaMetricsController.store.getState();
    const { mmiConfiguration } =
      this.mmiConfigurationController.store.getState();
    const { cookieSetUrls } = mmiConfiguration && mmiConfiguration.portfolio;
    const getAccountDetails = (address: string) =>
      this.custodyController.getAccountDetails(address);
    const extensionId = this.extension.runtime.id;
    const networks = [
      this.preferencesController.state.disabledRpcMethodPreferences,
      { chainId: CHAIN_IDS.MAINNET },
      { chainId: CHAIN_IDS.GOERLI },
    ];

    handleMmiPortfolio({
      keyringAccounts,
      identities,
      metaMetricsId,
      networks,
      // @ts-ignore
      cookieSetUrls,
      getAccountDetails,
      extensionId,
    });
  }

  async setAccountAndNetwork(origin: string, address: string, chainId: number) {
    await this.appStateController.getUnlockPromise(true);
    const selectedAddress = this.preferencesController.state.selectedAddress;
    if (selectedAddress.toLowerCase() !== address.toLowerCase()) {
      this.preferencesController.setSelectedAddress(address);
    }
    const selectedChainId = parseInt(
      this.networkController.getCurrentChainId(),
      16,
    );
    if (selectedChainId !== chainId && chainId === 1) {
      this.networkController.setProviderType('mainnet');
    } else if (selectedChainId !== chainId) {
      // @Shane T this doesn't exist here in core
      const network = this.preferencesController
        .getFrequentRpcListDetail()
        .find((item) => parseInt(item.chainId, 16) === chainId);
      this.networkController.setRpcTarget(
        network.rpcUrl,
        network.chainId,
        network.ticker,
        network.nickname,
      );
    }
    // @Shane T this doesn't exist here in core
    getPermissionBackgroundApiMethods(
      this.permissionController,
    ).addPermittedAccount(origin, address);

    return true;
  }

  async handleMmiOpenSwaps(origin: string, address: string, chainId: number) {
    await this.setAccountAndNetwork(origin, address, chainId);
    this.platform.openExtensionInBrowser(BUILD_QUOTE_ROUTE);
    return true;
  }

  async handleMmiOpenAddHardwareWallet() {
    await this.appStateController.getUnlockPromise(true);
    this.platform.openExtensionInBrowser(CONNECT_HARDWARE_ROUTE);
    return true;
  }

}
