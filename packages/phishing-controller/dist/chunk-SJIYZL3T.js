"use strict";Object.defineProperty(exports, "__esModule", {value: true});




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/PhishingController.ts
var _basecontroller = require('@metamask/base-controller');
var _controllerutils = require('@metamask/controller-utils');
var _ = require('punycode/');

// src/PhishingDetector.ts
var _fastestlevenshtein = require('fastest-levenshtein');
var _configs, _legacyConfig, _check, check_fn;
var PhishingDetector = class {
  /**
   * Construct a phishing detector, which can check whether origins are known
   * to be malicious or similar to common phishing targets.
   *
   * A list of configurations is accepted. Each origin checked is processed
   * using each configuration in sequence, so the order defines which
   * configurations take precedence.
   *
   * @param opts - Phishing detection options
   */
  constructor(opts) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _check);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _configs, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _legacyConfig, void 0);
    if (Array.isArray(opts)) {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _configs, processConfigs(opts));
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _legacyConfig, false);
    } else {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _configs, [
        getDefaultPhishingDetectorConfig({
          allowlist: opts.whitelist,
          blocklist: opts.blacklist,
          fuzzylist: opts.fuzzylist,
          tolerance: opts.tolerance
        })
      ]);
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _legacyConfig, true);
    }
  }
  /**
   * Check if a url is known to be malicious or similar to a common phishing
   * target. This will check the hostname and IPFS CID that is sometimes
   * located in the path.
   *
   * @param url - The url to check.
   * @returns The result of the check.
   */
  check(url) {
    const result = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _check, check_fn).call(this, url);
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _legacyConfig)) {
      let legacyType = result.type;
      if (legacyType === "allowlist") {
        legacyType = "whitelist";
      } else if (legacyType === "blocklist") {
        legacyType = "blacklist";
      }
      return {
        match: result.match,
        result: result.result,
        type: legacyType
      };
    }
    return result;
  }
};
_configs = new WeakMap();
_legacyConfig = new WeakMap();
_check = new WeakSet();
check_fn = function(url) {
  const domain = new URL(url).hostname;
  const fqdn = domain.endsWith(".") ? domain.slice(0, -1) : domain;
  const source = domainToParts(fqdn);
  for (const { allowlist, name, version } of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _configs)) {
    const allowlistMatch = matchPartsAgainstList(source, allowlist);
    if (allowlistMatch) {
      const match = domainPartsToDomain(allowlistMatch);
      return {
        match,
        name,
        result: false,
        type: "allowlist",
        version: version === void 0 ? version : String(version)
      };
    }
  }
  for (const { blocklist, fuzzylist, name, tolerance, version } of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _configs)) {
    const blocklistMatch = matchPartsAgainstList(source, blocklist);
    if (blocklistMatch) {
      const match = domainPartsToDomain(blocklistMatch);
      return {
        match,
        name,
        result: true,
        type: "blocklist",
        version: version === void 0 ? version : String(version)
      };
    }
    if (tolerance > 0) {
      let fuzzyForm = domainPartsToFuzzyForm(source);
      fuzzyForm = fuzzyForm.replace(/^www\./u, "");
      const levenshteinMatched = fuzzylist.find((targetParts) => {
        const fuzzyTarget = domainPartsToFuzzyForm(targetParts);
        const dist = _fastestlevenshtein.distance.call(void 0, fuzzyForm, fuzzyTarget);
        return dist <= tolerance;
      });
      if (levenshteinMatched) {
        const match = domainPartsToDomain(levenshteinMatched);
        return {
          name,
          match,
          result: true,
          type: "fuzzy",
          version: version === void 0 ? version : String(version)
        };
      }
    }
  }
  const ipfsCidMatch = url.match(ipfsCidRegex());
  if (ipfsCidMatch !== null) {
    const cID = ipfsCidMatch[0];
    for (const { blocklist, name, version } of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _configs)) {
      const blocklistMatch = blocklist.filter((entries) => entries.length === 1).find((entries) => {
        return entries[0] === cID;
      });
      if (blocklistMatch) {
        return {
          name,
          match: cID,
          result: true,
          type: "blocklist",
          version: version === void 0 ? version : String(version)
        };
      }
    }
  }
  return { result: false, type: "all" };
};
function ipfsCidRegex() {
  const reg = "Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,}";
  return new RegExp(reg, "u");
}

// src/PhishingController.ts
var PHISHING_CONFIG_BASE_URL = "https://phishing-detection.api.cx.metamask.io";
var METAMASK_STALELIST_FILE = "/v1/stalelist";
var METAMASK_HOTLIST_DIFF_FILE = "/v1/diffsSince";
var HOTLIST_REFRESH_INTERVAL = 5 * 60;
var STALELIST_REFRESH_INTERVAL = 30 * 24 * 60 * 60;
var METAMASK_STALELIST_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_STALELIST_FILE}`;
var METAMASK_HOTLIST_DIFF_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_HOTLIST_DIFF_FILE}`;
var ListKeys = /* @__PURE__ */ ((ListKeys2) => {
  ListKeys2["PhishfortHotlist"] = "phishfort_hotlist";
  ListKeys2["EthPhishingDetectConfig"] = "eth_phishing_detect_config";
  return ListKeys2;
})(ListKeys || {});
var ListNames = /* @__PURE__ */ ((ListNames2) => {
  ListNames2["MetaMask"] = "MetaMask";
  ListNames2["Phishfort"] = "Phishfort";
  return ListNames2;
})(ListNames || {});
var phishingListNameKeyMap = {
  ["Phishfort" /* Phishfort */]: "phishfort_hotlist" /* PhishfortHotlist */,
  ["MetaMask" /* MetaMask */]: "eth_phishing_detect_config" /* EthPhishingDetectConfig */
};
var phishingListKeyNameMap = {
  ["eth_phishing_detect_config" /* EthPhishingDetectConfig */]: "MetaMask" /* MetaMask */,
  ["phishfort_hotlist" /* PhishfortHotlist */]: "Phishfort" /* Phishfort */
};
var controllerName = "PhishingController";
var metadata = {
  phishingLists: { persist: true, anonymous: false },
  whitelist: { persist: true, anonymous: false },
  hotlistLastFetched: { persist: true, anonymous: false },
  stalelistLastFetched: { persist: true, anonymous: false }
};
var getDefaultState = () => {
  return {
    phishingLists: [],
    whitelist: [],
    hotlistLastFetched: 0,
    stalelistLastFetched: 0
  };
};
var _detector, _stalelistRefreshInterval, _hotlistRefreshInterval, _inProgressHotlistUpdate, _inProgressStalelistUpdate, _registerMessageHandlers, registerMessageHandlers_fn, _updateStalelist, updateStalelist_fn, _updateHotlist, updateHotlist_fn, _queryConfig, queryConfig_fn;
var PhishingController = class extends _basecontroller.BaseController {
  /**
   * Construct a Phishing Controller.
   *
   * @param config - Initial options used to configure this controller.
   * @param config.stalelistRefreshInterval - Polling interval used to fetch stale list.
   * @param config.hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
   * @param config.messenger - The controller restricted messenger.
   * @param config.state - Initial state to set on this controller.
   */
  constructor({
    stalelistRefreshInterval = STALELIST_REFRESH_INTERVAL,
    hotlistRefreshInterval = HOTLIST_REFRESH_INTERVAL,
    messenger,
    state = {}
  }) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultState(),
        ...state
      }
    });
    /**
     * Constructor helper for registering this controller's messaging system
     * actions.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    /**
     * Update the stalelist configuration.
     *
     * This should only be called from the `updateStalelist` function, which is a wrapper around
     * this function that prevents redundant configuration updates.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateStalelist);
    /**
     * Update the stalelist configuration.
     *
     * This should only be called from the `updateStalelist` function, which is a wrapper around
     * this function that prevents redundant configuration updates.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateHotlist);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _queryConfig);
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _detector, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _stalelistRefreshInterval, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _hotlistRefreshInterval, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _inProgressHotlistUpdate, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _inProgressStalelistUpdate, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _stalelistRefreshInterval, stalelistRefreshInterval);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _hotlistRefreshInterval, hotlistRefreshInterval);
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
    this.updatePhishingDetector();
  }
  /**
   * Updates this.detector with an instance of PhishingDetector using the current state.
   */
  updatePhishingDetector() {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _detector, new PhishingDetector(this.state.phishingLists));
  }
  /**
   * Set the interval at which the stale phishing list will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateStalelist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setStalelistRefreshInterval(interval) {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _stalelistRefreshInterval, interval);
  }
  /**
   * Set the interval at which the hot list will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateHotlist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setHotlistRefreshInterval(interval) {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _hotlistRefreshInterval, interval);
  }
  /**
   * Determine if an update to the stalelist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isStalelistOutOfDate() {
    return fetchTimeNow() - this.state.stalelistLastFetched >= _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _stalelistRefreshInterval);
  }
  /**
   * Determine if an update to the hotlist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isHotlistOutOfDate() {
    return fetchTimeNow() - this.state.hotlistLastFetched >= _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _hotlistRefreshInterval);
  }
  /**
   * Conditionally update the phishing configuration.
   *
   * If the stalelist configuration is out of date, this function will call `updateStalelist`
   * to update the configuration. This will automatically grab the hotlist,
   * so it isn't necessary to continue on to download the hotlist.
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
  test(origin) {
    const punycodeOrigin = _.toASCII.call(void 0, origin);
    if (this.state.whitelist.includes(punycodeOrigin)) {
      return { result: false, type: "all" };
    }
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _detector).check(punycodeOrigin);
  }
  /**
   * Temporarily marks a given origin as approved.
   *
   * @param origin - The origin to mark as approved.
   */
  bypass(origin) {
    const punycodeOrigin = _.toASCII.call(void 0, origin);
    const { whitelist } = this.state;
    if (whitelist.includes(punycodeOrigin)) {
      return;
    }
    this.update((draftState) => {
      draftState.whitelist.push(punycodeOrigin);
    });
  }
  /**
   * Update the hotlist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateHotlist() {
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProgressHotlistUpdate)) {
      await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProgressHotlistUpdate);
      return;
    }
    try {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _inProgressHotlistUpdate, _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateHotlist, updateHotlist_fn).call(this));
      await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProgressHotlistUpdate);
    } finally {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _inProgressHotlistUpdate, void 0);
    }
  }
  /**
   * Update the stalelist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateStalelist() {
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProgressStalelistUpdate)) {
      await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProgressStalelistUpdate);
      return;
    }
    try {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _inProgressStalelistUpdate, _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateStalelist, updateStalelist_fn).call(this));
      await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProgressStalelistUpdate);
    } finally {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _inProgressStalelistUpdate, void 0);
    }
  }
};
_detector = new WeakMap();
_stalelistRefreshInterval = new WeakMap();
_hotlistRefreshInterval = new WeakMap();
_inProgressHotlistUpdate = new WeakMap();
_inProgressStalelistUpdate = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    `${controllerName}:maybeUpdateState`,
    this.maybeUpdateState.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${controllerName}:testOrigin`,
    this.test.bind(this)
  );
};
_updateStalelist = new WeakSet();
updateStalelist_fn = async function() {
  let stalelistResponse;
  let hotlistDiffsResponse;
  try {
    stalelistResponse = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _queryConfig, queryConfig_fn).call(this, METAMASK_STALELIST_URL).then((d) => d);
    if (stalelistResponse?.data && stalelistResponse.data.lastUpdated > 0) {
      hotlistDiffsResponse = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _queryConfig, queryConfig_fn).call(this, `${METAMASK_HOTLIST_DIFF_URL}/${stalelistResponse.data.lastUpdated}`);
    }
  } finally {
    const timeNow = fetchTimeNow();
    this.update((draftState) => {
      draftState.stalelistLastFetched = timeNow;
      draftState.hotlistLastFetched = timeNow;
    });
  }
  if (!stalelistResponse || !hotlistDiffsResponse) {
    return;
  }
  const { phishfort_hotlist, eth_phishing_detect_config, ...partialState } = stalelistResponse.data;
  const phishfortListState = {
    ...phishfort_hotlist,
    ...partialState,
    fuzzylist: [],
    // Phishfort hotlist doesn't contain a fuzzylist
    allowlist: [],
    // Phishfort hotlist doesn't contain an allowlist
    name: phishingListKeyNameMap.phishfort_hotlist
  };
  const metamaskListState = {
    ...eth_phishing_detect_config,
    ...partialState,
    name: phishingListKeyNameMap.eth_phishing_detect_config
  };
  const newPhishfortListState = applyDiffs(
    phishfortListState,
    hotlistDiffsResponse.data,
    "phishfort_hotlist" /* PhishfortHotlist */
  );
  const newMetaMaskListState = applyDiffs(
    metamaskListState,
    hotlistDiffsResponse.data,
    "eth_phishing_detect_config" /* EthPhishingDetectConfig */
  );
  this.update((draftState) => {
    draftState.phishingLists = [newMetaMaskListState, newPhishfortListState];
  });
  this.updatePhishingDetector();
};
_updateHotlist = new WeakSet();
updateHotlist_fn = async function() {
  const lastDiffTimestamp = Math.max(
    ...this.state.phishingLists.map(({ lastUpdated }) => lastUpdated)
  );
  let hotlistResponse;
  try {
    hotlistResponse = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _queryConfig, queryConfig_fn).call(this, `${METAMASK_HOTLIST_DIFF_URL}/${lastDiffTimestamp}`);
  } finally {
    this.update((draftState) => {
      draftState.hotlistLastFetched = fetchTimeNow();
    });
  }
  if (!hotlistResponse?.data) {
    return;
  }
  const hotlist = hotlistResponse.data;
  const newPhishingLists = this.state.phishingLists.map(
    (phishingList) => applyDiffs(
      phishingList,
      hotlist,
      phishingListNameKeyMap[phishingList.name]
    )
  );
  this.update((draftState) => {
    draftState.phishingLists = newPhishingLists;
  });
  this.updatePhishingDetector();
};
_queryConfig = new WeakSet();
queryConfig_fn = async function(input) {
  const response = await _controllerutils.safelyExecute.call(void 0, 
    () => fetch(input, { cache: "no-cache" }),
    true
  );
  switch (response?.status) {
    case 200: {
      return await response.json();
    }
    default: {
      return null;
    }
  }
};
var PhishingController_default = PhishingController;

// src/utils.ts
var DEFAULT_TOLERANCE = 3;
var fetchTimeNow = () => Math.round(Date.now() / 1e3);
var splitStringByPeriod = (stringToSplit) => {
  const periodIndex = stringToSplit.indexOf(".");
  return [
    stringToSplit.slice(0, periodIndex),
    stringToSplit.slice(periodIndex + 1)
  ];
};
var applyDiffs = (listState, hotlistDiffs, listKey) => {
  const diffsToApply = hotlistDiffs.filter(
    ({ timestamp, targetList }) => timestamp > listState.lastUpdated && splitStringByPeriod(targetList)[0] === listKey
  );
  let latestDiffTimestamp = listState.lastUpdated;
  const listSets = {
    allowlist: new Set(listState.allowlist),
    blocklist: new Set(listState.blocklist),
    fuzzylist: new Set(listState.fuzzylist)
  };
  for (const { isRemoval, targetList, url, timestamp } of diffsToApply) {
    const targetListType = splitStringByPeriod(targetList)[1];
    if (timestamp > latestDiffTimestamp) {
      latestDiffTimestamp = timestamp;
    }
    if (isRemoval) {
      listSets[targetListType].delete(url);
    } else {
      listSets[targetListType].add(url);
    }
  }
  return {
    allowlist: Array.from(listSets.allowlist),
    blocklist: Array.from(listSets.blocklist),
    fuzzylist: Array.from(listSets.fuzzylist),
    version: listState.version,
    name: phishingListKeyNameMap[listKey],
    tolerance: listState.tolerance,
    lastUpdated: latestDiffTimestamp
  };
};
function validateConfig(config) {
  if (config === null || typeof config !== "object") {
    throw new Error("Invalid config");
  }
  if ("tolerance" in config && !("fuzzylist" in config)) {
    throw new Error("Fuzzylist tolerance provided without fuzzylist");
  }
  if ("name" in config && (typeof config.name !== "string" || config.name === "")) {
    throw new Error("Invalid config parameter: 'name'");
  }
  if ("version" in config && (!["number", "string"].includes(typeof config.version) || config.version === "")) {
    throw new Error("Invalid config parameter: 'version'");
  }
}
var domainToParts = (domain) => {
  try {
    return domain.split(".").reverse();
  } catch (e) {
    throw new Error(JSON.stringify(domain));
  }
};
var processDomainList = (list) => {
  return list.map(domainToParts);
};
var getDefaultPhishingDetectorConfig = ({
  allowlist = [],
  blocklist = [],
  fuzzylist = [],
  tolerance = DEFAULT_TOLERANCE
}) => ({
  allowlist: processDomainList(allowlist),
  blocklist: processDomainList(blocklist),
  fuzzylist: processDomainList(fuzzylist),
  tolerance
});
var processConfigs = (configs = []) => {
  return configs.map((config) => {
    validateConfig(config);
    return { ...config, ...getDefaultPhishingDetectorConfig(config) };
  });
};
var domainPartsToDomain = (domainParts) => {
  return domainParts.slice().reverse().join(".");
};
var domainPartsToFuzzyForm = (domainParts) => {
  return domainParts.slice(1).reverse().join(".");
};
var matchPartsAgainstList = (source, list) => {
  return list.find((target) => {
    if (target.length > source.length) {
      return false;
    }
    return target.every((part, index) => source[index] === part);
  });
};

























exports.fetchTimeNow = fetchTimeNow; exports.applyDiffs = applyDiffs; exports.validateConfig = validateConfig; exports.domainToParts = domainToParts; exports.processDomainList = processDomainList; exports.getDefaultPhishingDetectorConfig = getDefaultPhishingDetectorConfig; exports.processConfigs = processConfigs; exports.domainPartsToDomain = domainPartsToDomain; exports.domainPartsToFuzzyForm = domainPartsToFuzzyForm; exports.matchPartsAgainstList = matchPartsAgainstList; exports.PhishingDetector = PhishingDetector; exports.PHISHING_CONFIG_BASE_URL = PHISHING_CONFIG_BASE_URL; exports.METAMASK_STALELIST_FILE = METAMASK_STALELIST_FILE; exports.METAMASK_HOTLIST_DIFF_FILE = METAMASK_HOTLIST_DIFF_FILE; exports.HOTLIST_REFRESH_INTERVAL = HOTLIST_REFRESH_INTERVAL; exports.STALELIST_REFRESH_INTERVAL = STALELIST_REFRESH_INTERVAL; exports.METAMASK_STALELIST_URL = METAMASK_STALELIST_URL; exports.METAMASK_HOTLIST_DIFF_URL = METAMASK_HOTLIST_DIFF_URL; exports.ListKeys = ListKeys; exports.ListNames = ListNames; exports.phishingListKeyNameMap = phishingListKeyNameMap; exports.PhishingController = PhishingController; exports.PhishingController_default = PhishingController_default;
//# sourceMappingURL=chunk-SJIYZL3T.js.map