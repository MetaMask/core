import type {
  AddressBookControllerGetStateAction,
  AddressBookControllerState,
  AddressBookControllerStateChangeEvent,
} from '@metamask/address-book-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { HttpError, isValidHexAddress } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  TransactionControllerGetStateAction,
  TransactionControllerState,
  TransactionControllerStateChangeEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import {
  getEffectiveRecipient,
  TransactionStatus,
} from '@metamask/transaction-controller';
import { getErrorMessage } from '@metamask/utils';
import type { Patch } from 'immer';
import { toASCII } from 'punycode/punycode.js';

import { findSimilarAddresses } from './address-poisoning.js';
import {
  convertListToTrie,
  insertToTrie,
  matchedPathPrefix,
} from './PathTrie.js';
import type { PathTrie } from './PathTrie.js';
import type {
  PhishingControllerMaybeUpdateStateAction,
  PhishingControllerMethodActions,
  PhishingControllerTestOriginAction,
} from './PhishingController-method-action-types.js';
import type { PhishingDataServiceMethodActions } from './PhishingDataService-method-action-types.js';
import { PhishingDetector } from './PhishingDetector.js';
import {
  PhishingDetectorResultType,
  RecommendedAction,
  AddressScanResultType,
  ListKeys,
  phishingListNameKeyMap,
  phishingListKeyNameMap,
} from './types.js';
import type {
  PhishingDetectorResult,
  PhishingDetectionScanResult,
  BulkTokenScanResponse,
  BulkTokenScanRequest,
  TokenScanApiResponse,
  AddressScanResult,
  SimilarAddressMatch,
  ApprovalsResponse,
  BulkPhishingDetectionScanResponse,
  C2DomainBlocklistResponse,
  DataResultWrapper,
  Hotlist,
  PhishingListState,
  PhishingStalelist,
} from './types.js';
import {
  applyDiffs,
  fetchTimeNow,
  getHostnameFromUrl,
  roundToNearestMinute,
  getHostnameFromWebUrl,
  getPhishingDetectionScanUrlParam,
  resolveChainName,
  getPathnameFromUrl,
  getAddressScanSupportedChain,
  isApprovalSupportedChain,
  isTokenScanSupportedChain,
} from './utils.js';

export {
  PHISHING_CONFIG_BASE_URL,
  METAMASK_STALELIST_FILE,
  METAMASK_HOTLIST_DIFF_FILE,
  CLIENT_SIDE_DETECION_BASE_URL,
  C2_DOMAIN_BLOCKLIST_ENDPOINT,
  PHISHING_DETECTION_BASE_URL,
  PHISHING_DETECTION_SCAN_ENDPOINT,
  PHISHING_DETECTION_BULK_SCAN_ENDPOINT,
  SECURITY_ALERTS_BASE_URL,
  TOKEN_BULK_SCANNING_ENDPOINT,
  ADDRESS_SCAN_ENDPOINT,
  APPROVALS_ENDPOINT,
  METAMASK_STALELIST_URL,
  METAMASK_HOTLIST_DIFF_URL,
  C2_DOMAIN_BLOCKLIST_URL,
} from './PhishingDataService.js';
export { ListKeys, ListNames, phishingListKeyNameMap } from './types.js';
export type {
  ListTypes,
  EthPhishingResponse,
  C2DomainBlocklistResponse,
  PhishingStalelist,
  PhishingListState,
  HotlistDiff,
  DataResultWrapper,
  Hotlist,
  BulkPhishingDetectionScanResponse,
} from './types.js';

export const C2_DOMAIN_BLOCKLIST_REFRESH_INTERVAL = 5 * 60; // 5 mins in seconds
export const HOTLIST_REFRESH_INTERVAL = 5 * 60; // 5 mins in seconds
export const STALELIST_REFRESH_INTERVAL = 30 * 24 * 60 * 60; // 30 days in seconds

// Request timeouts, in milliseconds.
const URL_SCAN_TIMEOUT = 8000;
const BULK_URL_SCAN_TIMEOUT = 15000;
const TOKEN_SCAN_TIMEOUT = 8000;
const ADDRESS_SCAN_TIMEOUT = 5000;
const APPROVALS_TIMEOUT = 5000;

const controllerName = 'PhishingController';

const metadata: StateMetadata<PhishingControllerState> = {
  phishingLists: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  whitelist: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  whitelistPaths: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  hotlistLastFetched: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  stalelistLastFetched: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  c2DomainBlocklistLastFetched: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

/**
 * Get a default empty state for the controller.
 *
 * @returns The default empty state.
 */
const getDefaultState = (): PhishingControllerState => {
  return {
    phishingLists: [],
    whitelist: [],
    whitelistPaths: {},
    hotlistLastFetched: 0,
    stalelistLastFetched: 0,
    c2DomainBlocklistLastFetched: 0,
  };
};

/**
 * @type PhishingControllerState
 *
 * Phishing controller state
 * phishingLists - array of phishing lists
 * whitelist - origins that bypass the phishing detector
 * whitelistPaths - origins with paths that bypass the phishing detector
 * hotlistLastFetched - timestamp of the last hotlist fetch
 * stalelistLastFetched - timestamp of the last stalelist fetch
 * c2DomainBlocklistLastFetched - timestamp of the last c2 domain blocklist fetch
 */
export type PhishingControllerState = {
  phishingLists: PhishingListState[];
  whitelist: string[];
  whitelistPaths: PathTrie;
  hotlistLastFetched: number;
  stalelistLastFetched: number;
  c2DomainBlocklistLastFetched: number;
};

/**
 * PhishingControllerOptions
 *
 * Phishing controller options
 * stalelistRefreshInterval - Polling interval used to fetch stale list.
 * hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
 * c2DomainBlocklistRefreshInterval - Polling interval used to fetch c2 domain blocklist.
 */
export type PhishingControllerOptions = {
  stalelistRefreshInterval?: number;
  hotlistRefreshInterval?: number;
  c2DomainBlocklistRefreshInterval?: number;
  messenger: PhishingControllerMessenger;
  state?: Partial<PhishingControllerState>;
};

const MESSENGER_EXPOSED_METHODS = [
  'maybeUpdateState',
  'testOrigin',
  'isBlockedRequest',
  'bypass',
  'scanUrl',
  'bulkScanUrls',
  'bulkScanTokens',
  'scanAddress',
  'getApprovals',
  'checkAddressPoisoning',
] as const;

/**
 *  @deprecated Use `PhishingControllerTestOriginAction` instead.
 */
export type TestOrigin = PhishingControllerTestOriginAction;

/**
 *  @deprecated Use `PhishingControllerMaybeUpdateStateAction` instead.
 */
export type MaybeUpdateState = PhishingControllerMaybeUpdateStateAction;

export type PhishingControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PhishingControllerState
>;

export type PhishingControllerActions =
  | PhishingControllerGetStateAction
  | PhishingControllerMethodActions;

export type PhishingControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PhishingControllerState
>;

export type PhishingControllerEvents = PhishingControllerStateChangeEvent;

/**
 * The external actions available to the PhishingController.
 */
type AllowedActions =
  | AddressBookControllerGetStateAction
  | TransactionControllerGetStateAction
  | PhishingDataServiceMethodActions;

/**
 * The external events available to the PhishingController.
 */
export type AllowedEvents =
  | AddressBookControllerStateChangeEvent
  | TransactionControllerStateChangeEvent;

export type PhishingControllerMessenger = Messenger<
  typeof controllerName,
  PhishingControllerActions | AllowedActions,
  PhishingControllerEvents | AllowedEvents
>;

/**
 * Controller that manages community-maintained lists of approved and unapproved website origins.
 */
export class PhishingController extends BaseController<
  typeof controllerName,
  PhishingControllerState,
  PhishingControllerMessenger
> {
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #detector: any;

  readonly #stalelistRefreshInterval: number;

  readonly #hotlistRefreshInterval: number;

  readonly #c2DomainBlocklistRefreshInterval: number;

  readonly #knownRecipients: Set<string>;

  readonly #transactionRecipients: Set<string>;

  readonly #transactionRecipientsByTransactionId: Map<string, Set<string>>;

  readonly #transactionRecipientCounts: Map<string, number>;

  readonly #addressBookRecipients: Set<string>;

  #inProgressHotlistUpdate?: Promise<void>;

  #inProgressStalelistUpdate?: Promise<void>;

  #isProgressC2DomainBlocklistUpdate?: Promise<void>;

  readonly #transactionControllerStateChangeHandler: (
    state: TransactionControllerState,
    patches: Patch[],
  ) => void;

  readonly #addressBookControllerStateChangeHandler: (
    state: AddressBookControllerState,
  ) => void;

  /**
   * Construct a Phishing Controller.
   *
   * @param config - Initial options used to configure this controller.
   * @param config.stalelistRefreshInterval - Polling interval used to fetch stale list.
   * @param config.hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
   * @param config.c2DomainBlocklistRefreshInterval - Polling interval used to fetch c2 domain blocklist.
   * @param config.messenger - The controller restricted messenger.
   * @param config.state - Initial state to set on this controller.
   */
  constructor({
    stalelistRefreshInterval = STALELIST_REFRESH_INTERVAL,
    hotlistRefreshInterval = HOTLIST_REFRESH_INTERVAL,
    c2DomainBlocklistRefreshInterval = C2_DOMAIN_BLOCKLIST_REFRESH_INTERVAL,
    messenger,
    state = {},
  }: PhishingControllerOptions) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultState(),
        ...state,
      },
    });

    this.#stalelistRefreshInterval = stalelistRefreshInterval;
    this.#hotlistRefreshInterval = hotlistRefreshInterval;
    this.#c2DomainBlocklistRefreshInterval = c2DomainBlocklistRefreshInterval;
    this.#knownRecipients = new Set();
    this.#transactionRecipients = new Set();
    this.#transactionRecipientsByTransactionId = new Map();
    this.#transactionRecipientCounts = new Map();
    this.#addressBookRecipients = new Set();
    this.#transactionControllerStateChangeHandler =
      this.#onTransactionControllerStateChange.bind(this);
    this.#addressBookControllerStateChangeHandler =
      this.#onAddressBookControllerStateChange.bind(this);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.updatePhishingDetector();
    this.#hydrateKnownRecipients();
    this.#subscribeToAddressBookControllerStateChange();
    this.#subscribeToTransactionControllerStateChange();
  }

  #subscribeToAddressBookControllerStateChange(): void {
    this.messenger.subscribe(
      // eslint-disable-next-line no-restricted-syntax
      'AddressBookController:stateChange',
      this.#addressBookControllerStateChangeHandler,
    );
  }

  #subscribeToTransactionControllerStateChange(): void {
    this.messenger.subscribe(
      // eslint-disable-next-line no-restricted-syntax
      'TransactionController:stateChange',
      this.#transactionControllerStateChangeHandler,
    );
  }

  /**
   * Checks if a patch represents a transaction-level change or nested transaction property change
   *
   * @param patch - Immer patch to check
   * @returns True if patch affects a transaction or its nested properties
   */
  #isTransactionPatch(patch: Patch): boolean {
    const { path } = patch;
    return (
      path.length === 2 &&
      path[0] === 'transactions' &&
      typeof path[1] === 'number'
    );
  }

  /**
   * Checks if a patch represents a simulation data change
   *
   * @param patch - Immer patch to check
   * @returns True if patch represents a simulation data change
   */
  #isSimulationDataPatch(patch: Patch): boolean {
    const { path } = patch;
    return (
      path.length === 3 &&
      path[0] === 'transactions' &&
      typeof path[1] === 'number' &&
      path[2] === 'simulationData'
    );
  }

  /**
   * Handle transaction controller state changes using Immer patches
   * Extracts token addresses from simulation data and groups them by chain for bulk scanning
   *
   * @param _state - The current transaction controller state
   * @param _state.transactions - Array of transaction metadata
   * @param patches - Array of Immer patches only for transaction-level changes
   */
  #onTransactionControllerStateChange(
    _state: TransactionControllerState,
    patches: Patch[],
  ): void {
    try {
      try {
        this.#updateKnownRecipientsFromTransactionPatches(_state, patches);
      } catch (error) {
        console.error(
          'Error updating known recipients from transaction state:',
          error,
        );
      }

      const tokensByChain = new Map<string, Set<string>>();

      for (const patch of patches) {
        if (patch.op === 'remove') {
          continue;
        }

        // Handle transaction-level patches (includes simulation data updates)
        if (this.#isTransactionPatch(patch)) {
          const transaction = patch.value as TransactionMeta;
          this.#getTokensFromTransaction(transaction, tokensByChain);
        } else if (this.#isSimulationDataPatch(patch)) {
          const transactionIndex = patch.path[1] as number;
          const transaction = _state.transactions?.[transactionIndex];
          this.#getTokensFromTransaction(transaction, tokensByChain);
        }
      }

      this.#scanTokensByChain(tokensByChain);
    } catch (error) {
      console.error('Error processing transaction state change:', error);
    }
  }

  #onAddressBookControllerStateChange(state: AddressBookControllerState): void {
    this.#setKnownRecipientsFromAddressBookState(state);
  }

  /**
   * Collect token addresses from a transaction and group them by chain
   *
   * @param transaction - Transaction metadata to extract tokens from
   * @param tokensByChain - Map to collect tokens grouped by chainId
   */
  #getTokensFromTransaction(
    transaction: TransactionMeta,
    tokensByChain: Map<string, Set<string>>,
  ): void {
    // extract token addresses from simulation data
    const tokenAddresses = transaction.simulationData?.tokenBalanceChanges?.map(
      (tokenChange) => tokenChange.address.toLowerCase(),
    );

    // add token addresses to the map by chainId
    if (tokenAddresses && tokenAddresses.length > 0 && transaction.chainId) {
      const chainId = transaction.chainId.toLowerCase();

      if (!tokensByChain.has(chainId)) {
        tokensByChain.set(chainId, new Set());
      }

      const chainTokens = tokensByChain.get(chainId);
      if (chainTokens) {
        for (const address of tokenAddresses) {
          chainTokens.add(address);
        }
      }
    }
  }

  /**
   * Scan tokens grouped by chain ID
   *
   * @param tokensByChain - Map of chainId to token addresses
   */
  #scanTokensByChain(tokensByChain: Map<string, Set<string>>): void {
    for (const [chainId, tokenSet] of tokensByChain) {
      if (tokenSet.size > 0) {
        const tokens = Array.from(tokenSet);
        this.bulkScanTokens({
          chainId,
          tokens,
        }).catch((error) =>
          console.error(`Error scanning tokens for chain ${chainId}:`, error),
        );
      }
    }
  }

  #hydrateKnownRecipients(): void {
    this.#hydrateKnownRecipientsFromTransactionState();
    this.#hydrateKnownRecipientsFromAddressBookState();
  }

  #hydrateKnownRecipientsFromTransactionState(): void {
    try {
      const state = this.messenger.call('TransactionController:getState');
      this.#setKnownRecipientsFromTransactionState(state);
    } catch (error) {
      console.error(
        'Unable to hydrate known recipients from TransactionController state; address poisoning checks will not include existing confirmed transactions.',
        error,
      );
    }
  }

  #hydrateKnownRecipientsFromAddressBookState(): void {
    try {
      const state = this.messenger.call('AddressBookController:getState');
      this.#setKnownRecipientsFromAddressBookState(state);
    } catch (error) {
      console.error(
        'Unable to hydrate known recipients from AddressBookController state; address poisoning checks will not include existing address book entries.',
        error,
      );
    }
  }

  #setKnownRecipientsFromTransactionState(
    state: TransactionControllerState,
  ): void {
    this.#transactionRecipients.clear();
    this.#transactionRecipientsByTransactionId.clear();
    this.#transactionRecipientCounts.clear();

    for (const transaction of state.transactions) {
      this.#addTransactionRecipients(transaction);
    }

    this.#rebuildKnownRecipients();
  }

  #updateKnownRecipientsFromTransactionPatches(
    state: TransactionControllerState,
    patches: Patch[],
  ): void {
    let recipientsChanged = false;

    for (const patch of patches) {
      if (patch.path[0] !== 'transactions') {
        continue;
      }

      if (patch.path.length === 1) {
        this.#setKnownRecipientsFromTransactionState(state);
        return;
      }

      const transactionIndex = patch.path[1];

      if (transactionIndex === 'length') {
        this.#setKnownRecipientsFromTransactionState(state);
        return;
      }

      if (patch.op === 'remove') {
        this.#setKnownRecipientsFromTransactionState(state);
        return;
      }

      if (typeof transactionIndex !== 'number') {
        this.#setKnownRecipientsFromTransactionState(state);
        return;
      }

      const transaction =
        this.#getTransactionFromPatchValue(patch.value) ??
        state.transactions[transactionIndex];

      if (!transaction) {
        continue;
      }

      recipientsChanged =
        this.#updateTransactionRecipients(transaction) || recipientsChanged;
    }

    if (recipientsChanged) {
      this.#rebuildKnownRecipients();
    }
  }

  #getTransactionFromPatchValue(value: unknown): TransactionMeta | undefined {
    const transaction = value as Partial<TransactionMeta>;

    if (
      value &&
      typeof value === 'object' &&
      typeof transaction.id === 'string' &&
      transaction.txParams !== undefined
    ) {
      return value as TransactionMeta;
    }

    return undefined;
  }

  #updateTransactionRecipients(transaction: TransactionMeta): boolean {
    const recipientsRemoved = this.#removeTransactionRecipients(transaction.id);
    const recipientsAdded = this.#addTransactionRecipients(transaction);

    return recipientsRemoved || recipientsAdded;
  }

  #addTransactionRecipients(transaction: TransactionMeta): boolean {
    const recipients = this.#getRecipientAddressesFromTransaction(transaction);

    if (recipients.length === 0) {
      return false;
    }

    this.#transactionRecipientsByTransactionId.set(
      transaction.id,
      new Set(recipients),
    );

    for (const address of recipients) {
      const count = this.#transactionRecipientCounts.get(address) ?? 0;
      this.#transactionRecipientCounts.set(address, count + 1);
      this.#transactionRecipients.add(address);
    }

    return true;
  }

  #removeTransactionRecipients(transactionId: string): boolean {
    const recipients =
      this.#transactionRecipientsByTransactionId.get(transactionId);

    if (!recipients) {
      return false;
    }

    this.#transactionRecipientsByTransactionId.delete(transactionId);

    for (const address of recipients) {
      const count = this.#transactionRecipientCounts.get(address) as number;

      if (count <= 1) {
        this.#transactionRecipientCounts.delete(address);
        this.#transactionRecipients.delete(address);
      } else {
        this.#transactionRecipientCounts.set(address, count - 1);
      }
    }

    return true;
  }

  #setKnownRecipientsFromAddressBookState(
    state: AddressBookControllerState,
  ): void {
    this.#addressBookRecipients.clear();
    for (const address of this.#getAddressBookRecipients(state)) {
      this.#addressBookRecipients.add(address);
    }
    this.#rebuildKnownRecipients();
  }

  #rebuildKnownRecipients(): void {
    this.#knownRecipients.clear();

    for (const address of this.#transactionRecipients) {
      this.#knownRecipients.add(address);
    }

    for (const address of this.#addressBookRecipients) {
      this.#knownRecipients.add(address);
    }
  }

  #getAddressBookRecipients(state: AddressBookControllerState): Set<string> {
    return new Set(
      Object.values(state.addressBook)
        .flatMap((entriesByAddress) => Object.values(entriesByAddress))
        .map((entry) => entry.address.toLowerCase()),
    );
  }

  #getRecipientAddressesFromTransaction(
    transaction: TransactionMeta,
  ): string[] {
    if (transaction.status !== TransactionStatus.confirmed) {
      return [];
    }

    const transactionRecipient = this.#normalizeAddress(
      getEffectiveRecipient(transaction),
    );
    const swapAndSendRecipient = this.#normalizeAddress(
      transaction.swapAndSendRecipient,
    );

    return Array.from(
      new Set(
        [transactionRecipient, swapAndSendRecipient].filter(
          (address): address is string => Boolean(address),
        ),
      ),
    );
  }

  #normalizeAddress(address?: string | null): string | null {
    if (!address || !isValidHexAddress(address, { allowNonPrefixed: false })) {
      return null;
    }

    return address.toLowerCase();
  }

  /**
   * Updates this.detector with an instance of PhishingDetector using the current state.
   */
  updatePhishingDetector(): void {
    this.#detector = new PhishingDetector(this.state.phishingLists);
  }

  /**
   * Finds known recipient addresses that look like an address poisoning match.
   *
   * @param candidate - The recipient address being checked.
   * @returns Similar known recipient matches sorted by score.
   */
  checkAddressPoisoning(candidate: string): SimilarAddressMatch[] {
    return findSimilarAddresses(candidate, Array.from(this.#knownRecipients));
  }

  /**
   * Determine if an update to the stalelist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isStalelistOutOfDate() {
    return (
      fetchTimeNow() - this.state.stalelistLastFetched >=
      this.#stalelistRefreshInterval
    );
  }

  /**
   * Determine if an update to the hotlist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isHotlistOutOfDate() {
    return (
      fetchTimeNow() - this.state.hotlistLastFetched >=
      this.#hotlistRefreshInterval
    );
  }

  /**
   * Determine if an update to the C2 domain blocklist is needed.
   *
   * @returns Whether an update is needed
   */
  isC2DomainBlocklistOutOfDate() {
    return (
      fetchTimeNow() - this.state.c2DomainBlocklistLastFetched >=
      this.#c2DomainBlocklistRefreshInterval
    );
  }

  /**
   * Conditionally update the phishing configuration.
   *
   * If the stalelist configuration is out of date, this function will call `updateStalelist`
   * to update the configuration. This will automatically grab the hotlist,
   * so it isn't necessary to continue on to download the hotlist and the c2 domain blocklist.
   *
   */
  async maybeUpdateState() {
    const staleListOutOfDate = this.isStalelistOutOfDate();
    if (staleListOutOfDate) {
      await this.updateStalelist();
      return;
    }
    const hotlistOutOfDate = this.isHotlistOutOfDate();
    if (hotlistOutOfDate) {
      await this.updateHotlist();
    }
    const c2DomainBlocklistOutOfDate = this.isC2DomainBlocklistOutOfDate();
    if (c2DomainBlocklistOutOfDate) {
      await this.updateC2DomainBlocklist();
    }
  }

  /**
   * Determines if a given origin is unapproved.
   *
   * It is strongly recommended that you call {@link maybeUpdateState} before calling this,
   * to check whether the phishing configuration is up-to-date. It will be updated if necessary
   * by calling {@link updateStalelist} or {@link updateHotlist}.
   *
   * @param origin - Domain origin of a website.
   * @returns Whether the origin is an unapproved origin.
   */
  testOrigin(origin: string): PhishingDetectorResult {
    const punycodeOrigin = toASCII(origin);
    const hostname = getHostnameFromUrl(punycodeOrigin);
    const hostnameWithPaths = hostname + getPathnameFromUrl(origin);

    if (matchedPathPrefix(hostnameWithPaths, this.state.whitelistPaths)) {
      return { result: false, type: PhishingDetectorResultType.All };
    }

    if (this.state.whitelist.includes(hostname || punycodeOrigin)) {
      return { result: false, type: PhishingDetectorResultType.All }; // Same as whitelisted match returned by detector.check(...).
    }
    return this.#detector.check(punycodeOrigin);
  }

  /**
   * Determines if a given origin is unapproved.
   *
   * It is strongly recommended that you call {@link maybeUpdateState} before calling this,
   * to check whether the phishing configuration is up-to-date. It will be updated if necessary
   * by calling {@link updateStalelist} or {@link updateHotlist}.
   *
   * @param origin - Domain origin of a website.
   * @returns Whether the origin is an unapproved origin.
   * @deprecated Use {@link testOrigin} instead. This method is exposed for backward compatibility and will be removed in a future release.
   */
  test = this.testOrigin.bind(this);

  /**
   * Checks if a request URL's domain is blocked against the request blocklist.
   *
   * This method is used to determine if a specific request URL is associated with a malicious
   * command and control (C2) domain. The URL's hostname is hashed and checked against a configured
   * blocklist of known malicious domains.
   *
   * @param origin - The full request URL to be checked.
   * @returns An object indicating whether the URL's domain is blocked and relevant metadata.
   */
  isBlockedRequest(origin: string): PhishingDetectorResult {
    const punycodeOrigin = toASCII(origin);
    const hostname = getHostnameFromUrl(punycodeOrigin);
    if (this.state.whitelist.includes(hostname || punycodeOrigin)) {
      return { result: false, type: PhishingDetectorResultType.All }; // Same as whitelisted match returned by detector.check(...).
    }
    return this.#detector.isMaliciousC2Domain(punycodeOrigin);
  }

  /**
   * Temporarily marks a given origin as approved.
   *
   * @param origin - The origin to mark as approved.
   */
  bypass(origin: string) {
    const punycodeOrigin = toASCII(origin);
    const hostname = getHostnameFromUrl(punycodeOrigin);
    const hostnameWithPaths = hostname + getPathnameFromUrl(origin);
    const { whitelist, whitelistPaths } = this.state;
    const whitelistPath = matchedPathPrefix(hostnameWithPaths, whitelistPaths);

    if (whitelist.includes(hostname || punycodeOrigin) || whitelistPath) {
      return;
    }

    // If the origin was blocked by a path, then we only want to add it to the whitelistPaths since
    // other paths with the same hostname may not be blocked.
    const blockingPath = this.#detector.blockingPath(origin);
    if (blockingPath) {
      this.update((draftState) => {
        insertToTrie(blockingPath, draftState.whitelistPaths);
      });
      return;
    }

    this.update((draftState) => {
      draftState.whitelist.push(hostname || punycodeOrigin);
    });
  }

  /**
   * Update the C2 domain blocklist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateC2DomainBlocklist() {
    if (this.#isProgressC2DomainBlocklistUpdate) {
      await this.#isProgressC2DomainBlocklistUpdate;
      return;
    }

    try {
      this.#isProgressC2DomainBlocklistUpdate = this.#updateC2DomainBlocklist();
      await this.#isProgressC2DomainBlocklistUpdate;
    } finally {
      this.#isProgressC2DomainBlocklistUpdate = undefined;
    }
  }

  /**
   * Update the hotlist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateHotlist() {
    if (this.#inProgressHotlistUpdate) {
      await this.#inProgressHotlistUpdate;
      return;
    }

    try {
      this.#inProgressHotlistUpdate = this.#updateHotlist();
      await this.#inProgressHotlistUpdate;
    } finally {
      this.#inProgressHotlistUpdate = undefined;
    }
  }

  /**
   * Update the stalelist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateStalelist() {
    if (this.#inProgressStalelistUpdate) {
      await this.#inProgressStalelistUpdate;
      return;
    }

    try {
      this.#inProgressStalelistUpdate = this.#updateStalelist();
      await this.#inProgressStalelistUpdate;
    } finally {
      this.#inProgressStalelistUpdate = undefined;
    }
  }

  /**
   * Scan a URL for phishing. For most hosts only the hostname is sent to the API; for known
   * shared gateways the pathname is included (see `PHISHING_DETECTION_PATH_BASED_ROOT_DOMAINS`).
   * Only supports web URLs (`http:` / `https:`).
   *
   * @param url - The URL to scan.
   * @returns The phishing detection scan result.
   */
  async scanUrl(url: string): Promise<PhishingDetectionScanResult> {
    const [scanUrlParam, scanParamOk] = getPhishingDetectionScanUrlParam(url);
    if (!scanParamOk) {
      return {
        hostname: '',
        recommendedAction: RecommendedAction.None,
        fetchError: 'url is not a valid web URL',
      };
    }

    const [hostname] = getHostnameFromWebUrl(url);

    let scanResult: PhishingDetectionScanResult;
    try {
      scanResult = await this.#callWithTimeout(
        this.messenger.call('PhishingDataService:scanUrl', scanUrlParam),
        URL_SCAN_TIMEOUT,
      );
    } catch (error) {
      return {
        hostname: '',
        recommendedAction: RecommendedAction.None,
        fetchError: getErrorMessage(error),
      };
    }

    return {
      hostname,
      recommendedAction: scanResult.recommendedAction,
    };
  }

  /**
   * Scan multiple URLs for phishing in bulk. It will only scan the hostnames of the URLs.
   * It also only supports web URLs.
   *
   * @param urls - The URLs to scan.
   * @returns A mapping of URLs to their phishing detection scan results and errors.
   */
  async bulkScanUrls(
    urls: string[],
  ): Promise<BulkPhishingDetectionScanResponse> {
    if (!urls || urls.length === 0) {
      return {
        results: {},
        errors: {},
      };
    }

    // we are arbitrarily limiting the number of URLs to 250
    const MAX_TOTAL_URLS = 250;
    if (urls.length > MAX_TOTAL_URLS) {
      return {
        results: {},
        errors: {
          too_many_urls: [
            `Maximum of ${MAX_TOTAL_URLS} URLs allowed per request`,
          ],
        },
      };
    }

    const MAX_URL_LENGTH = 2048;
    const combinedResponse: BulkPhishingDetectionScanResponse = {
      results: {},
      errors: {},
    };

    // Check URLs for validity and length constraints
    const urlsToFetch: string[] = [];

    for (const url of urls) {
      if (url.length > MAX_URL_LENGTH) {
        combinedResponse.errors[url] = [
          `URL length must not exceed ${MAX_URL_LENGTH} characters`,
        ];
        continue;
      }

      const [, ok] = getHostnameFromWebUrl(url);
      if (!ok) {
        combinedResponse.errors[url] = ['url is not a valid web URL'];
        continue;
      }

      urlsToFetch.push(url);
    }

    // If there are URLs to fetch, process them in batches
    if (urlsToFetch.length > 0) {
      // The API has a limit of 50 URLs per request, so we batch the requests
      const MAX_URLS_PER_BATCH = 50;
      const batches: string[][] = [];
      for (let i = 0; i < urlsToFetch.length; i += MAX_URLS_PER_BATCH) {
        batches.push(urlsToFetch.slice(i, i + MAX_URLS_PER_BATCH));
      }

      // Process each batch in parallel
      const batchResults = await Promise.all(
        batches.map((batchUrls) => this.#processBatch(batchUrls)),
      );

      // Merge results and errors from all batches
      batchResults.forEach((batchResponse) => {
        Object.entries(batchResponse.results).forEach(([url, result]) => {
          combinedResponse.results[url] = result;
        });

        // Combine errors
        Object.entries(batchResponse.errors).forEach(([key, messages]) => {
          combinedResponse.errors[key] = [
            ...(combinedResponse.errors[key] || []),
            ...messages,
          ];
        });
      });
    }

    return combinedResponse;
  }

  /**
   * Fetch bulk token scan results from the security alerts API.
   *
   * @param chain - The chain name.
   * @param tokens - Array of token addresses to scan.
   * @returns The API response or null if there was an error.
   */
  readonly #fetchTokenScanBulkResults = async (
    chain: string,
    tokens: string[],
  ): Promise<TokenScanApiResponse | null> => {
    try {
      return await this.#callWithTimeout(
        this.messenger.call(
          'PhishingDataService:bulkScanTokens',
          chain,
          tokens,
        ),
        TOKEN_SCAN_TIMEOUT,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        console.warn(`Token bulk screening API error: ${error.message}`);
      } else {
        console.error(`Error scanning tokens: ${getErrorMessage(error)}`);
      }
      return null;
    }
  };

  /**
   * Scan an address for security alerts.
   *
   * @param chainId - The chain ID in hex format (e.g., '0x1' for Ethereum).
   * @param address - The address to scan.
   * @returns The address scan result.
   */
  async scanAddress(
    chainId: string,
    address: string,
  ): Promise<AddressScanResult> {
    if (!address || !chainId) {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    }

    const normalizedChainId = chainId.toLowerCase();
    const normalizedAddress = address.toLowerCase();
    const chain = getAddressScanSupportedChain(normalizedChainId);

    if (!chain) {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    }

    try {
      const scanResult = await this.#callWithTimeout(
        this.messenger.call(
          'PhishingDataService:scanAddress',
          chain,
          normalizedAddress,
        ),
        ADDRESS_SCAN_TIMEOUT,
      );
      return {
        result_type: scanResult.result_type,
        label: scanResult.label,
      };
    } catch {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    }
  }

  /**
   * Get token approvals for an EVM address with security enrichments.
   *
   * @param chainId - The chain ID in hex format (e.g., '0x1' for Ethereum).
   * @param address - The address to get approvals for.
   * @returns The approvals response containing approval data, or empty approvals on error.
   */
  getApprovals = async (
    chainId: string,
    address: string,
  ): Promise<ApprovalsResponse> => {
    if (!address || !chainId) {
      return { approvals: [] };
    }

    const normalizedChainId = chainId.toLowerCase();
    const normalizedAddress = address.toLowerCase();
    const chain = resolveChainName(normalizedChainId);

    if (!chain || !isApprovalSupportedChain(chain)) {
      return { approvals: [] };
    }

    try {
      return await this.#callWithTimeout(
        this.messenger.call(
          'PhishingDataService:getApprovals',
          chain,
          normalizedAddress,
        ),
        APPROVALS_TIMEOUT,
      );
    } catch {
      return { approvals: [] };
    }
  };

  /**
   * Scan multiple tokens for malicious activity in bulk.
   *
   * @param request - The bulk scan request containing chainId and tokens.
   * @param request.chainId - The chain identifier. Accepts a hex chain ID for
   * EVM chains (e.g. `'0x1'` for Ethereum) or a chain name for non-EVM chains
   * (e.g. `'solana'`).
   * @param request.tokens - Array of token addresses to scan.
   * @returns A mapping of token addresses to their scan results. For EVM chains,
   * addresses are lowercased; for non-EVM chains, original casing is preserved.
   * Tokens that fail to scan are omitted.
   */
  async bulkScanTokens(
    request: BulkTokenScanRequest,
  ): Promise<BulkTokenScanResponse> {
    const { chainId, tokens } = request;

    if (!tokens || tokens.length === 0) {
      return {};
    }

    const MAX_TOKENS_PER_REQUEST = 100;
    if (tokens.length > MAX_TOKENS_PER_REQUEST) {
      console.warn(
        `Maximum of ${MAX_TOKENS_PER_REQUEST} tokens allowed per request`,
      );
      return {};
    }

    const normalizedChainId = chainId.toLowerCase();
    const chain = resolveChainName(normalizedChainId);

    if (!chain || !isTokenScanSupportedChain(chain)) {
      console.warn(`Unsupported chain ID: ${chainId}`);
      return {};
    }

    // EVM addresses are case-insensitive; non-EVM addresses (e.g. Solana
    // base58) are case-sensitive and must not be lowercased.
    const caseSensitive = !normalizedChainId.startsWith('0x');
    const normalizedTokens = caseSensitive
      ? tokens
      : tokens.map((tokenAddress) => tokenAddress.toLowerCase());

    const results: BulkTokenScanResponse = {};

    const apiResponse = await this.#fetchTokenScanBulkResults(
      chain,
      normalizedTokens,
    );
    if (apiResponse?.results) {
      for (const normalizedAddress of normalizedTokens) {
        const tokenResult = apiResponse.results[normalizedAddress];

        if (tokenResult?.result_type) {
          results[normalizedAddress] = {
            result_type: tokenResult.result_type,
            chain: tokenResult.chain || normalizedChainId,
            address: tokenResult.address || normalizedAddress,
          };
        }
      }
    }

    return results;
  }

  /**
   * Process a batch of URLs (up to 50) for phishing detection.
   *
   * @param urls - A batch of URLs to scan.
   * @returns The scan results and errors for this batch.
   */
  readonly #processBatch = async (
    urls: string[],
  ): Promise<BulkPhishingDetectionScanResponse> => {
    try {
      return await this.#callWithTimeout(
        this.messenger.call('PhishingDataService:bulkScanUrls', urls),
        BULK_URL_SCAN_TIMEOUT,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          results: {},
          errors: {
            api_error: [error.message],
          },
        };
      }
      return {
        results: {},
        errors: {
          network_error: [getErrorMessage(error)],
        },
      };
    }
  };

  /**
   * Update the stalelist configuration.
   *
   * This should only be called from the `updateStalelist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateStalelist() {
    let stalelistResponse: DataResultWrapper<PhishingStalelist> | null = null;
    let hotlistDiffsResponse: DataResultWrapper<Hotlist> | null = null;
    let c2DomainBlocklistResponse: C2DomainBlocklistResponse | null = null;
    try {
      const stalelistPromise = this.#safelyCallService(() =>
        this.messenger.call('PhishingDataService:getStalelist'),
      );

      const c2DomainBlocklistPromise = this.#safelyCallService(() =>
        this.messenger.call('PhishingDataService:getC2DomainBlocklist'),
      );

      [stalelistResponse, c2DomainBlocklistResponse] = await Promise.all([
        stalelistPromise,
        c2DomainBlocklistPromise,
      ]);
      // Fetching hotlist diffs relies on having a lastUpdated timestamp to do `GET /v1/diffsSince/:timestamp`,
      // so it doesn't make sense to call if there is not a timestamp to begin with.
      const stalelistData = stalelistResponse?.data;
      if (stalelistData && stalelistData.lastUpdated > 0) {
        hotlistDiffsResponse = await this.#safelyCallService(() =>
          this.messenger.call(
            'PhishingDataService:getHotlistDiffs',
            stalelistData.lastUpdated,
          ),
        );
      }
    } finally {
      // Set `stalelistLastFetched` and `hotlistLastFetched` even for failed requests to prevent server
      // from being overwhelmed with traffic after a network disruption.
      const timeNow = fetchTimeNow();
      this.update((draftState) => {
        draftState.stalelistLastFetched = timeNow;
        draftState.hotlistLastFetched = timeNow;
        if (c2DomainBlocklistResponse) {
          draftState.c2DomainBlocklistLastFetched = timeNow;
        }
      });
    }

    if (!stalelistResponse || !hotlistDiffsResponse) {
      return;
    }

    const metamaskListState: PhishingListState = {
      allowlist: stalelistResponse.data.allowlist,
      fuzzylist: stalelistResponse.data.fuzzylist,
      tolerance: stalelistResponse.data.tolerance,
      version: stalelistResponse.data.version,
      lastUpdated: stalelistResponse.data.lastUpdated,
      blocklist: stalelistResponse.data.blocklist,
      blocklistPaths: convertListToTrie(stalelistResponse.data.blocklistPaths),
      c2DomainBlocklist: c2DomainBlocklistResponse
        ? c2DomainBlocklistResponse.recentlyAdded
        : [],
      name: phishingListKeyNameMap.eth_phishing_detect_config,
    };

    const newMetaMaskListState: PhishingListState = applyDiffs(
      metamaskListState,
      hotlistDiffsResponse.data,
      ListKeys.EthPhishingDetectConfig,
    );

    this.update((draftState) => {
      draftState.phishingLists = [newMetaMaskListState];
    });
    this.updatePhishingDetector();
  }

  /**
   * Update the stalelist configuration.
   *
   * This should only be called from the `updateStalelist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateHotlist() {
    let hotlistResponse: DataResultWrapper<Hotlist> | null;

    try {
      if (this.state.phishingLists.length === 0) {
        return;
      }

      const lastDiffTimestamp = Math.max(
        ...this.state.phishingLists.map(({ lastUpdated }) => lastUpdated),
      );

      hotlistResponse = await this.#safelyCallService(() =>
        this.messenger.call(
          'PhishingDataService:getHotlistDiffs',
          lastDiffTimestamp,
        ),
      );
    } finally {
      // Set `hotlistLastFetched` even for failed requests to prevent server from being overwhelmed with
      // traffic after a network disruption.
      this.update((draftState) => {
        draftState.hotlistLastFetched = fetchTimeNow();
      });
    }

    if (!hotlistResponse?.data) {
      return;
    }
    const hotlist = hotlistResponse.data;
    const newPhishingLists = this.state.phishingLists.map((phishingList) => {
      const updatedList = applyDiffs(
        phishingList,
        hotlist,
        phishingListNameKeyMap[phishingList.name],
        [],
        [],
      );

      return updatedList;
    });

    this.update((draftState) => {
      draftState.phishingLists = newPhishingLists;
    });
    this.updatePhishingDetector();
  }

  /**
   * Update the C2 domain blocklist.
   *
   * This should only be called from the `updateC2DomainBlocklist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateC2DomainBlocklist() {
    const c2DomainBlocklistResponse = await this.#safelyCallService(() =>
      this.messenger.call(
        'PhishingDataService:getC2DomainBlocklist',
        roundToNearestMinute(this.state.c2DomainBlocklistLastFetched),
      ),
    );

    if (!c2DomainBlocklistResponse) {
      return;
    }

    this.update((draftState) => {
      draftState.c2DomainBlocklistLastFetched = fetchTimeNow();
    });

    const recentlyAddedC2Domains = c2DomainBlocklistResponse.recentlyAdded;
    const recentlyRemovedC2Domains = c2DomainBlocklistResponse.recentlyRemoved;

    const newPhishingLists = this.state.phishingLists.map((phishingList) => {
      const updatedList = applyDiffs(
        phishingList,
        [],
        phishingListNameKeyMap[phishingList.name],
        recentlyAddedC2Domains,
        recentlyRemovedC2Domains,
      );

      return updatedList;
    });

    this.update((draftState) => {
      draftState.phishingLists = newPhishingLists;
    });
    this.updatePhishingDetector();
  }

  /**
   * Calls the data service, returning `null` instead of throwing if the call
   * fails for any reason (network error, non-2xx response, or malformed
   * response).
   *
   * @param call - The service call to execute.
   * @returns The result of the call, or `null` if it failed.
   */
  async #safelyCallService<Type>(
    call: () => Promise<Type>,
  ): Promise<Type | null> {
    try {
      return await call();
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * Awaits a promise, rejecting if it does not settle within the given
   * timeout. On timeout, any eventual rejection of the original promise is
   * suppressed to avoid unhandled rejections.
   *
   * @param promise - The promise to await.
   * @param timeout - The timeout in milliseconds.
   * @returns The result of the promise.
   */
  async #callWithTimeout<Type>(
    promise: Promise<Type>,
    timeout: number,
  ): Promise<Type> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            promise.catch(() => undefined);
            reject(new Error(`timeout of ${timeout}ms exceeded`));
          }, timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export default PhishingController;

export type { PhishingDetectorResult };
