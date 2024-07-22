import {
  NameType
} from "./chunk-OJVA6C3V.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/NameController.ts
import { BaseController } from "@metamask/base-controller";
import { isSafeDynamicKey } from "@metamask/controller-utils";
var FALLBACK_VARIATION = "*";
var PROPOSED_NAME_EXPIRE_DURATION = 60 * 60 * 24;
var NameOrigin = /* @__PURE__ */ ((NameOrigin2) => {
  NameOrigin2["ACCOUNT_IDENTITY"] = "account-identity";
  NameOrigin2["ADDRESS_BOOK"] = "address-book";
  NameOrigin2["API"] = "api";
  NameOrigin2["UI"] = "ui";
  return NameOrigin2;
})(NameOrigin || {});
var DEFAULT_UPDATE_DELAY = 60 * 2;
var DEFAULT_VARIATION = "";
var controllerName = "NameController";
var stateMetadata = {
  names: { persist: true, anonymous: false },
  nameSources: { persist: true, anonymous: false }
};
var getDefaultState = () => ({
  names: {
    ["ethereumAddress" /* ETHEREUM_ADDRESS */]: {}
  },
  nameSources: {}
});
var _providers, _updateDelay, _updateProposedNameState, updateProposedNameState_fn, _updateSourceState, updateSourceState_fn, _getUpdateProposedNamesResult, getUpdateProposedNamesResult_fn, _getProviderResponse, getProviderResponse_fn, _normalizeProviderResult, normalizeProviderResult_fn, _normalizeProviderSourceResult, normalizeProviderSourceResult_fn, _normalizeValue, normalizeValue_fn, _normalizeVariation, normalizeVariation_fn, _updateEntry, updateEntry_fn, _getCurrentTimeSeconds, getCurrentTimeSeconds_fn, _validateSetNameRequest, validateSetNameRequest_fn, _validateUpdateProposedNamesRequest, validateUpdateProposedNamesRequest_fn, _validateValue, validateValue_fn, _validateType, validateType_fn, _validateName, validateName_fn, _validateSourceIds, validateSourceIds_fn, _validateSourceId, validateSourceId_fn, _validateDuplicateSourceIds, validateDuplicateSourceIds_fn, _validateVariation, validateVariation_fn, _validateOrigin, validateOrigin_fn, _getAllSourceIds, getAllSourceIds_fn, _getSourceIds, getSourceIds_fn, _removeDormantProposedNames, removeDormantProposedNames_fn, _removeExpiredEntries, removeExpiredEntries_fn, _getEntriesList, getEntriesList_fn;
var NameController = class extends BaseController {
  /**
   * Construct a Name controller.
   *
   * @param options - Controller options.
   * @param options.messenger - Restricted controller messenger for the name controller.
   * @param options.providers - Array of name provider instances to propose names.
   * @param options.state - Initial state to set on the controller.
   * @param options.updateDelay - The delay in seconds before a new request to a source should be made.
   */
  constructor({
    messenger,
    providers,
    state,
    updateDelay
  }) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state }
    });
    __privateAdd(this, _updateProposedNameState);
    __privateAdd(this, _updateSourceState);
    __privateAdd(this, _getUpdateProposedNamesResult);
    __privateAdd(this, _getProviderResponse);
    __privateAdd(this, _normalizeProviderResult);
    __privateAdd(this, _normalizeProviderSourceResult);
    __privateAdd(this, _normalizeValue);
    __privateAdd(this, _normalizeVariation);
    __privateAdd(this, _updateEntry);
    __privateAdd(this, _getCurrentTimeSeconds);
    __privateAdd(this, _validateSetNameRequest);
    __privateAdd(this, _validateUpdateProposedNamesRequest);
    __privateAdd(this, _validateValue);
    __privateAdd(this, _validateType);
    __privateAdd(this, _validateName);
    __privateAdd(this, _validateSourceIds);
    __privateAdd(this, _validateSourceId);
    __privateAdd(this, _validateDuplicateSourceIds);
    __privateAdd(this, _validateVariation);
    __privateAdd(this, _validateOrigin);
    __privateAdd(this, _getAllSourceIds);
    __privateAdd(this, _getSourceIds);
    __privateAdd(this, _removeDormantProposedNames);
    __privateAdd(this, _removeExpiredEntries);
    __privateAdd(this, _getEntriesList);
    __privateAdd(this, _providers, void 0);
    __privateAdd(this, _updateDelay, void 0);
    __privateSet(this, _providers, providers);
    __privateSet(this, _updateDelay, updateDelay ?? DEFAULT_UPDATE_DELAY);
  }
  /**
   * Set the user specified name for a value.
   *
   * @param request - Request object.
   * @param request.name - Name to set.
   * @param request.sourceId - Optional ID of the source of the proposed name.
   * @param request.type - Type of value to set the name for.
   * @param request.value - Value to set the name for.
   * @param request.variation - Variation of the raw value to set the name for. The chain ID if the type is Ethereum address.
   */
  setName(request) {
    __privateMethod(this, _validateSetNameRequest, validateSetNameRequest_fn).call(this, request);
    const {
      value,
      type,
      name,
      sourceId: requestSourceId,
      origin: requestOrigin,
      variation
    } = request;
    const sourceId = requestSourceId ?? null;
    const fallbackOrigin = name === null ? null : "api" /* API */;
    const origin = requestOrigin ?? fallbackOrigin;
    __privateMethod(this, _updateEntry, updateEntry_fn).call(this, value, type, variation, (entry) => {
      entry.name = name;
      entry.sourceId = sourceId;
      entry.origin = origin;
    });
  }
  /**
   * Generate the proposed names for a value using the name providers and store them in the state.
   *
   * @param request - Request object.
   * @param request.value - Value to update the proposed names for.
   * @param request.type - Type of value to update the proposed names for.
   * @param request.sourceIds - Optional array of source IDs to limit which sources are used by the providers. If not provided, all sources in all providers will be used.
   * @param request.variation - Variation of the raw value to update proposed names for. The chain ID if the type is Ethereum address.
   * @returns The updated proposed names for the value.
   */
  async updateProposedNames(request) {
    __privateMethod(this, _validateUpdateProposedNamesRequest, validateUpdateProposedNamesRequest_fn).call(this, request);
    const providerResponses = (await Promise.all(
      __privateGet(this, _providers).map(
        (provider) => __privateMethod(this, _getProviderResponse, getProviderResponse_fn).call(this, request, provider)
      )
    )).filter((response) => Boolean(response));
    __privateMethod(this, _updateProposedNameState, updateProposedNameState_fn).call(this, request, providerResponses);
    __privateMethod(this, _updateSourceState, updateSourceState_fn).call(this, __privateGet(this, _providers));
    __privateMethod(this, _removeExpiredEntries, removeExpiredEntries_fn).call(this);
    return __privateMethod(this, _getUpdateProposedNamesResult, getUpdateProposedNamesResult_fn).call(this, providerResponses);
  }
};
_providers = new WeakMap();
_updateDelay = new WeakMap();
_updateProposedNameState = new WeakSet();
updateProposedNameState_fn = function(request, providerResponses) {
  const { value, type, variation } = request;
  const currentTime = __privateMethod(this, _getCurrentTimeSeconds, getCurrentTimeSeconds_fn).call(this);
  __privateMethod(this, _updateEntry, updateEntry_fn).call(this, value, type, variation, (entry) => {
    __privateMethod(this, _removeDormantProposedNames, removeDormantProposedNames_fn).call(this, entry.proposedNames, type);
    for (const providerResponse of providerResponses) {
      const { results } = providerResponse;
      for (const sourceId of Object.keys(providerResponse.results)) {
        const result = results[sourceId];
        const { proposedNames, updateDelay } = result;
        const proposedNameEntry = entry.proposedNames[sourceId] ?? {
          proposedNames: [],
          lastRequestTime: null,
          updateDelay: null
        };
        entry.proposedNames[sourceId] = proposedNameEntry;
        if (proposedNames) {
          proposedNameEntry.proposedNames = proposedNames;
        }
        proposedNameEntry.lastRequestTime = currentTime;
        proposedNameEntry.updateDelay = updateDelay ?? null;
      }
    }
  });
};
_updateSourceState = new WeakSet();
updateSourceState_fn = function(providers) {
  const newNameSources = { ...this.state.nameSources };
  for (const provider of providers) {
    const { sourceLabels } = provider.getMetadata();
    for (const sourceId of Object.keys(sourceLabels)) {
      newNameSources[sourceId] = {
        label: sourceLabels[sourceId]
      };
    }
  }
  this.update((state) => {
    state.nameSources = newNameSources;
  });
};
_getUpdateProposedNamesResult = new WeakSet();
getUpdateProposedNamesResult_fn = function(providerResponses) {
  return providerResponses.reduce(
    (acc, providerResponse) => {
      const { results } = providerResponse;
      for (const sourceId of Object.keys(results)) {
        const { proposedNames, error } = results[sourceId];
        acc.results[sourceId] = {
          proposedNames,
          error
        };
      }
      return acc;
    },
    { results: {} }
  );
};
_getProviderResponse = new WeakSet();
getProviderResponse_fn = async function(request, provider) {
  const {
    value,
    type,
    sourceIds: requestedSourceIds,
    onlyUpdateAfterDelay,
    variation
  } = request;
  const variationKey = variation ?? DEFAULT_VARIATION;
  const supportedSourceIds = __privateMethod(this, _getSourceIds, getSourceIds_fn).call(this, provider, type);
  const currentTime = __privateMethod(this, _getCurrentTimeSeconds, getCurrentTimeSeconds_fn).call(this);
  const normalizedValue = __privateMethod(this, _normalizeValue, normalizeValue_fn).call(this, value, type);
  const matchingSourceIds = supportedSourceIds.filter((sourceId) => {
    if (requestedSourceIds && !requestedSourceIds.includes(sourceId)) {
      return false;
    }
    if (onlyUpdateAfterDelay) {
      const entry = this.state.names[type]?.[normalizedValue]?.[variationKey] ?? {};
      const proposedNamesEntry = entry.proposedNames?.[sourceId] ?? {};
      const lastRequestTime = proposedNamesEntry.lastRequestTime ?? 0;
      const updateDelay = proposedNamesEntry.updateDelay ?? __privateGet(this, _updateDelay);
      if (currentTime - lastRequestTime < updateDelay) {
        return false;
      }
    }
    return true;
  });
  if (!matchingSourceIds.length) {
    return void 0;
  }
  const providerRequest = {
    value: __privateMethod(this, _normalizeValue, normalizeValue_fn).call(this, value, type),
    type,
    sourceIds: requestedSourceIds ? matchingSourceIds : void 0,
    variation: __privateMethod(this, _normalizeVariation, normalizeVariation_fn).call(this, variationKey, type)
  };
  let responseError;
  let response;
  try {
    response = await provider.getProposedNames(providerRequest);
    responseError = response.error;
  } catch (error) {
    responseError = error;
  }
  return __privateMethod(this, _normalizeProviderResult, normalizeProviderResult_fn).call(this, response, responseError, matchingSourceIds);
};
_normalizeProviderResult = new WeakSet();
normalizeProviderResult_fn = function(result, responseError, matchingSourceIds) {
  const error = responseError ?? void 0;
  const results = matchingSourceIds.reduce((acc, sourceId) => {
    const sourceResult = result?.results?.[sourceId];
    const normalizedSourceResult = __privateMethod(this, _normalizeProviderSourceResult, normalizeProviderSourceResult_fn).call(this, sourceResult, responseError);
    return {
      ...acc,
      [sourceId]: normalizedSourceResult
    };
  }, {});
  return { results, error };
};
_normalizeProviderSourceResult = new WeakSet();
normalizeProviderSourceResult_fn = function(result, responseError) {
  const error = result?.error ?? responseError ?? void 0;
  const updateDelay = result?.updateDelay ?? void 0;
  let proposedNames = error ? void 0 : result?.proposedNames ?? void 0;
  if (proposedNames) {
    proposedNames = proposedNames.filter(
      (proposedName) => proposedName?.length
    );
  }
  return {
    proposedNames,
    error,
    updateDelay
  };
};
_normalizeValue = new WeakSet();
normalizeValue_fn = function(value, type) {
  switch (type) {
    case "ethereumAddress" /* ETHEREUM_ADDRESS */:
      return value.toLowerCase();
    default:
      return value;
  }
};
_normalizeVariation = new WeakSet();
normalizeVariation_fn = function(variation, type) {
  switch (type) {
    case "ethereumAddress" /* ETHEREUM_ADDRESS */:
      return variation.toLowerCase();
    default:
      return variation;
  }
};
_updateEntry = new WeakSet();
updateEntry_fn = function(value, type, variation, callback) {
  const variationKey = variation ?? DEFAULT_VARIATION;
  const normalizedValue = __privateMethod(this, _normalizeValue, normalizeValue_fn).call(this, value, type);
  const normalizedVariation = __privateMethod(this, _normalizeVariation, normalizeVariation_fn).call(this, variationKey, type);
  if ([normalizedValue, normalizedVariation].some(
    (key) => !isSafeDynamicKey(key)
  )) {
    return;
  }
  this.update((state) => {
    const typeEntries = state.names[type] || {};
    state.names[type] = typeEntries;
    const variationEntries = typeEntries[normalizedValue] || {};
    typeEntries[normalizedValue] = variationEntries;
    const entry = variationEntries[normalizedVariation] ?? {
      proposedNames: {},
      name: null,
      sourceId: null,
      origin: null
    };
    variationEntries[normalizedVariation] = entry;
    callback(entry);
  });
};
_getCurrentTimeSeconds = new WeakSet();
getCurrentTimeSeconds_fn = function() {
  return Math.round(Date.now() / 1e3);
};
_validateSetNameRequest = new WeakSet();
validateSetNameRequest_fn = function(request) {
  const { name, value, type, sourceId, variation, origin } = request;
  const errorMessages = [];
  __privateMethod(this, _validateValue, validateValue_fn).call(this, value, errorMessages);
  __privateMethod(this, _validateType, validateType_fn).call(this, type, errorMessages);
  __privateMethod(this, _validateName, validateName_fn).call(this, name, errorMessages);
  __privateMethod(this, _validateSourceId, validateSourceId_fn).call(this, sourceId, type, name, errorMessages);
  __privateMethod(this, _validateVariation, validateVariation_fn).call(this, variation, type, errorMessages);
  __privateMethod(this, _validateOrigin, validateOrigin_fn).call(this, origin, name, errorMessages);
  if (errorMessages.length) {
    throw new Error(errorMessages.join(" "));
  }
};
_validateUpdateProposedNamesRequest = new WeakSet();
validateUpdateProposedNamesRequest_fn = function(request) {
  const { value, type, sourceIds, variation } = request;
  const errorMessages = [];
  __privateMethod(this, _validateValue, validateValue_fn).call(this, value, errorMessages);
  __privateMethod(this, _validateType, validateType_fn).call(this, type, errorMessages);
  __privateMethod(this, _validateSourceIds, validateSourceIds_fn).call(this, sourceIds, type, errorMessages);
  __privateMethod(this, _validateDuplicateSourceIds, validateDuplicateSourceIds_fn).call(this, type, errorMessages);
  __privateMethod(this, _validateVariation, validateVariation_fn).call(this, variation, type, errorMessages);
  if (errorMessages.length) {
    throw new Error(errorMessages.join(" "));
  }
};
_validateValue = new WeakSet();
validateValue_fn = function(value, errorMessages) {
  if (!value?.length || typeof value !== "string") {
    errorMessages.push("Must specify a non-empty string for value.");
  }
};
_validateType = new WeakSet();
validateType_fn = function(type, errorMessages) {
  if (!Object.values(NameType).includes(type)) {
    errorMessages.push(
      `Must specify one of the following types: ${Object.values(
        NameType
      ).join(", ")}`
    );
  }
};
_validateName = new WeakSet();
validateName_fn = function(name, errorMessages) {
  if (name === null) {
    return;
  }
  if (!name?.length || typeof name !== "string") {
    errorMessages.push("Must specify a non-empty string or null for name.");
  }
};
_validateSourceIds = new WeakSet();
validateSourceIds_fn = function(sourceIds, type, errorMessages) {
  if (!sourceIds) {
    return;
  }
  const allSourceIds = __privateMethod(this, _getAllSourceIds, getAllSourceIds_fn).call(this, type);
  const missingSourceIds = [];
  for (const sourceId of sourceIds) {
    if (!allSourceIds.includes(sourceId)) {
      missingSourceIds.push(sourceId);
      continue;
    }
  }
  if (missingSourceIds.length) {
    errorMessages.push(
      `Unknown source IDs for type '${type}': ${missingSourceIds.join(", ")}`
    );
  }
};
_validateSourceId = new WeakSet();
validateSourceId_fn = function(sourceId, type, name, errorMessages) {
  if (sourceId === null || sourceId === void 0) {
    return;
  }
  if (name === null) {
    errorMessages.push(
      `Cannot specify a source ID when clearing the saved name: ${sourceId}`
    );
    return;
  }
  const allSourceIds = __privateMethod(this, _getAllSourceIds, getAllSourceIds_fn).call(this, type);
  if (!sourceId.length || typeof sourceId !== "string") {
    errorMessages.push("Must specify a non-empty string for sourceId.");
    return;
  }
  if (!allSourceIds.includes(sourceId)) {
    errorMessages.push(`Unknown source ID for type '${type}': ${sourceId}`);
  }
};
_validateDuplicateSourceIds = new WeakSet();
validateDuplicateSourceIds_fn = function(type, errorMessages) {
  const allSourceIds = __privateMethod(this, _getAllSourceIds, getAllSourceIds_fn).call(this, type);
  const duplicateSourceIds = allSourceIds.filter(
    (sourceId, index) => allSourceIds.indexOf(sourceId) !== index
  );
  if (duplicateSourceIds.length) {
    errorMessages.push(
      `Duplicate source IDs found for type '${type}': ${duplicateSourceIds.join(
        ", "
      )}`
    );
  }
};
_validateVariation = new WeakSet();
validateVariation_fn = function(variation, type, errorMessages) {
  if (type !== "ethereumAddress" /* ETHEREUM_ADDRESS */) {
    return;
  }
  if (!variation?.length || typeof variation !== "string" || !variation.match(/^0x[0-9A-Fa-f]+$/u) && variation !== FALLBACK_VARIATION) {
    errorMessages.push(
      `Must specify a chain ID in hexidecimal format or the fallback, "${FALLBACK_VARIATION}", for variation when using '${type}' type.`
    );
  }
};
_validateOrigin = new WeakSet();
validateOrigin_fn = function(origin, name, errorMessages) {
  if (!origin) {
    return;
  }
  if (name === null) {
    errorMessages.push(
      `Cannot specify an origin when clearing the saved name: ${origin}`
    );
    return;
  }
  if (!Object.values(NameOrigin).includes(origin)) {
    errorMessages.push(
      `Must specify one of the following origins: ${Object.values(
        NameOrigin
      ).join(", ")}`
    );
  }
};
_getAllSourceIds = new WeakSet();
getAllSourceIds_fn = function(type) {
  return __privateGet(this, _providers).map((provider) => __privateMethod(this, _getSourceIds, getSourceIds_fn).call(this, provider, type)).flat();
};
_getSourceIds = new WeakSet();
getSourceIds_fn = function(provider, type) {
  return provider.getMetadata().sourceIds[type];
};
_removeDormantProposedNames = new WeakSet();
removeDormantProposedNames_fn = function(proposedNames, type) {
  if (Object.keys(proposedNames).length === 0) {
    return;
  }
  const typeSourceIds = __privateMethod(this, _getAllSourceIds, getAllSourceIds_fn).call(this, type);
  const dormantSourceIds = Object.keys(proposedNames).filter(
    (sourceId) => !typeSourceIds.includes(sourceId)
  );
  for (const dormantSourceId of dormantSourceIds) {
    delete proposedNames[dormantSourceId];
  }
};
_removeExpiredEntries = new WeakSet();
removeExpiredEntries_fn = function() {
  const currentTime = __privateMethod(this, _getCurrentTimeSeconds, getCurrentTimeSeconds_fn).call(this);
  this.update((state) => {
    const entries = __privateMethod(this, _getEntriesList, getEntriesList_fn).call(this, state);
    for (const { nameType, value, variation, entry } of entries) {
      if (entry.name !== null) {
        continue;
      }
      const proposedNames = Object.values(entry.proposedNames);
      const allProposedNamesExpired = proposedNames.every(
        (proposedName) => currentTime - (proposedName.lastRequestTime ?? 0) >= PROPOSED_NAME_EXPIRE_DURATION
      );
      if (allProposedNamesExpired) {
        delete state.names[nameType][value][variation];
      }
    }
  });
};
_getEntriesList = new WeakSet();
getEntriesList_fn = function(state) {
  return Object.entries(state.names).flatMap(
    ([type, typeEntries]) => Object.entries(typeEntries).flatMap(
      ([value, variationEntries]) => Object.entries(variationEntries).map(([variation, entry]) => ({
        entry,
        nameType: type,
        value,
        variation
      }))
    )
  );
};

export {
  FALLBACK_VARIATION,
  PROPOSED_NAME_EXPIRE_DURATION,
  NameOrigin,
  NameController
};
//# sourceMappingURL=chunk-NWKFJCG6.mjs.map