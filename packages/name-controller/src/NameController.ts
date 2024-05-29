import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { isSafeDynamicKey } from '@metamask/controller-utils';

import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
  NameProviderSourceResult,
} from './types';
import { NameType } from './types';

export const FALLBACK_VARIATION = '*';
export const PROPOSED_NAME_EXPIRE_DURATION = 60 * 60 * 24; // 24 hours

/**
 * Enumerates the possible origins responsible for setting a petname.
 */
export enum NameOrigin {
  // Originated from an account identity.
  ACCOUNT_IDENTITY = 'account-identity',
  // Originated from an address book entry.
  ADDRESS_BOOK = 'address-book',
  // Originated from the API (NameController.setName). This is the default.
  API = 'api',
  // Originated from the user taking action in the UI.
  UI = 'ui',
}

const DEFAULT_UPDATE_DELAY = 60 * 2; // 2 Minutes
const DEFAULT_VARIATION = '';

const controllerName = 'NameController';

const stateMetadata = {
  names: { persist: true, anonymous: false },
  nameSources: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  names: {
    [NameType.ETHEREUM_ADDRESS]: {},
  },
  nameSources: {},
});

export type ProposedNamesEntry = {
  proposedNames: string[];
  lastRequestTime: number | null;
  updateDelay: number | null;
};

export type NameEntry = {
  name: string | null;
  sourceId: string | null;
  origin: NameOrigin | null;
  proposedNames: Record<string, ProposedNamesEntry>;
};

export type SourceEntry = {
  label: string;
};

export type NameControllerState = {
  // Type > Value > Variation > Entry
  names: Record<NameType, Record<string, Record<string, NameEntry>>>;
  nameSources: Record<string, SourceEntry>;
};

export type GetNameState = ControllerGetStateAction<
  typeof controllerName,
  NameControllerState
>;

export type NameStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  NameControllerState
>;

export type NameControllerActions = GetNameState;

export type NameControllerEvents = NameStateChange;

export type NameControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  NameControllerActions,
  NameControllerEvents,
  never,
  never
>;

export type NameControllerOptions = {
  messenger: NameControllerMessenger;
  providers: NameProvider[];
  state?: Partial<NameControllerState>;
  updateDelay?: number;
};

export type UpdateProposedNamesRequest = {
  value: string;
  type: NameType;
  sourceIds?: string[];
  onlyUpdateAfterDelay?: boolean;
  variation?: string;
};

export type UpdateProposedNamesResult = {
  results: Record<string, { proposedNames?: string[]; error?: unknown }>;
};

export type SetNameRequest = {
  value: string;
  type: NameType;
  name: string | null;
  sourceId?: string;
  variation?: string;
  origin?: NameOrigin;
};

/**
 * Controller for storing and deriving names for values such as Ethereum addresses.
 */
export class NameController extends BaseController<
  typeof controllerName,
  NameControllerState,
  NameControllerMessenger
> {
  #providers: NameProvider[];

  #updateDelay: number;

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
    updateDelay,
  }: NameControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.#providers = providers;
    this.#updateDelay = updateDelay ?? DEFAULT_UPDATE_DELAY;
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
  setName(request: SetNameRequest) {
    this.#validateSetNameRequest(request);

    const {
      value,
      type,
      name,
      sourceId: requestSourceId,
      origin: requestOrigin,
      variation,
    } = request;
    const sourceId = requestSourceId ?? null;
    // If the name is being cleared, the fallback origin should be cleared as well.
    const fallbackOrigin = name === null ? null : NameOrigin.API;
    const origin = requestOrigin ?? fallbackOrigin;

    this.#updateEntry(value, type, variation, (entry: NameEntry) => {
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
  async updateProposedNames(
    request: UpdateProposedNamesRequest,
  ): Promise<UpdateProposedNamesResult> {
    this.#validateUpdateProposedNamesRequest(request);

    const providerResponses = (
      await Promise.all(
        this.#providers.map((provider) =>
          this.#getProviderResponse(request, provider),
        ),
      )
    ).filter((response) => Boolean(response)) as NameProviderResult[];

    this.#updateProposedNameState(request, providerResponses);
    this.#updateSourceState(this.#providers);
    this.#removeExpiredEntries();

    return this.#getUpdateProposedNamesResult(providerResponses);
  }

  #updateProposedNameState(
    request: UpdateProposedNamesRequest,
    providerResponses: NameProviderResult[],
  ) {
    const { value, type, variation } = request;
    const currentTime = this.#getCurrentTimeSeconds();

    this.#updateEntry(value, type, variation, (entry: NameEntry) => {
      this.#removeDormantProposedNames(entry.proposedNames, type);

      for (const providerResponse of providerResponses) {
        const { results } = providerResponse;

        for (const sourceId of Object.keys(providerResponse.results)) {
          const result = results[sourceId];
          const { proposedNames, updateDelay } = result;

          const proposedNameEntry = entry.proposedNames[sourceId] ?? {
            proposedNames: [],
            lastRequestTime: null,
            updateDelay: null,
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
  }

  #updateSourceState(providers: NameProvider[]) {
    const newNameSources = { ...this.state.nameSources };

    for (const provider of providers) {
      const { sourceLabels } = provider.getMetadata();

      for (const sourceId of Object.keys(sourceLabels)) {
        newNameSources[sourceId] = {
          label: sourceLabels[sourceId],
        };
      }
    }

    this.update((state) => {
      state.nameSources = newNameSources;
    });
  }

  #getUpdateProposedNamesResult(
    providerResponses: NameProviderResult[],
  ): UpdateProposedNamesResult {
    return providerResponses.reduce(
      (acc: UpdateProposedNamesResult, providerResponse) => {
        const { results } = providerResponse;

        for (const sourceId of Object.keys(results)) {
          const { proposedNames, error } = results[sourceId];

          acc.results[sourceId] = {
            proposedNames,
            error,
          };
        }

        return acc;
      },
      { results: {} },
    );
  }

  async #getProviderResponse(
    request: UpdateProposedNamesRequest,
    provider: NameProvider,
  ): Promise<NameProviderResult | undefined> {
    const {
      value,
      type,
      sourceIds: requestedSourceIds,
      onlyUpdateAfterDelay,
      variation,
    } = request;

    /* istanbul ignore next */
    const variationKey = variation ?? DEFAULT_VARIATION;
    const supportedSourceIds = this.#getSourceIds(provider, type);
    const currentTime = this.#getCurrentTimeSeconds();
    const normalizedValue = this.#normalizeValue(value, type);

    const matchingSourceIds = supportedSourceIds.filter((sourceId) => {
      if (requestedSourceIds && !requestedSourceIds.includes(sourceId)) {
        return false;
      }

      if (onlyUpdateAfterDelay) {
        const entry =
          this.state.names[type]?.[normalizedValue]?.[variationKey] ?? {};
        const proposedNamesEntry = entry.proposedNames?.[sourceId] ?? {};
        const lastRequestTime = proposedNamesEntry.lastRequestTime ?? 0;
        const updateDelay = proposedNamesEntry.updateDelay ?? this.#updateDelay;

        if (currentTime - lastRequestTime < updateDelay) {
          return false;
        }
      }

      return true;
    });

    if (!matchingSourceIds.length) {
      return undefined;
    }

    const providerRequest: NameProviderRequest = {
      value: this.#normalizeValue(value, type),
      type,
      sourceIds: requestedSourceIds ? matchingSourceIds : undefined,
      variation: this.#normalizeVariation(variationKey, type),
    };

    let responseError: unknown | undefined;
    let response: NameProviderResult | undefined;

    try {
      response = await provider.getProposedNames(providerRequest);
      responseError = response.error;
    } catch (error) {
      responseError = error;
    }

    return this.#normalizeProviderResult(
      response,
      responseError,
      matchingSourceIds,
    );
  }

  #normalizeProviderResult(
    result: NameProviderResult | undefined,
    responseError: unknown,
    matchingSourceIds: string[],
  ): NameProviderResult {
    const error = responseError ?? undefined;

    const results = matchingSourceIds.reduce((acc, sourceId) => {
      const sourceResult = result?.results?.[sourceId];

      const normalizedSourceResult = this.#normalizeProviderSourceResult(
        sourceResult,
        responseError,
      );

      return {
        ...acc,
        [sourceId]: normalizedSourceResult,
      };
    }, {});

    return { results, error };
  }

  #normalizeProviderSourceResult(
    result: NameProviderSourceResult | undefined,
    responseError: unknown,
  ): NameProviderSourceResult | undefined {
    const error = result?.error ?? responseError ?? undefined;
    const updateDelay = result?.updateDelay ?? undefined;
    let proposedNames = error ? undefined : result?.proposedNames ?? undefined;

    if (proposedNames) {
      proposedNames = proposedNames.filter(
        (proposedName) => proposedName?.length,
      );
    }

    return {
      proposedNames,
      error,
      updateDelay,
    };
  }

  #normalizeValue(value: string, type: NameType): string {
    /* istanbul ignore next */
    switch (type) {
      case NameType.ETHEREUM_ADDRESS:
        return value.toLowerCase();

      default:
        return value;
    }
  }

  #normalizeVariation(variation: string, type: NameType): string {
    /* istanbul ignore next */
    switch (type) {
      case NameType.ETHEREUM_ADDRESS:
        return variation.toLowerCase();

      default:
        return variation;
    }
  }

  #updateEntry(
    value: string,
    type: NameType,
    variation: string | undefined,
    callback: (entry: NameEntry) => void,
  ) {
    /* istanbul ignore next */
    const variationKey = variation ?? DEFAULT_VARIATION;
    const normalizedValue = this.#normalizeValue(value, type);
    const normalizedVariation = this.#normalizeVariation(variationKey, type);

    if (
      [normalizedValue, normalizedVariation].some(
        (key) => !isSafeDynamicKey(key),
      )
    ) {
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
        origin: null,
      };
      variationEntries[normalizedVariation] = entry;

      callback(entry);
    });
  }

  #getCurrentTimeSeconds(): number {
    return Math.round(Date.now() / 1000);
  }

  #validateSetNameRequest(request: SetNameRequest) {
    const { name, value, type, sourceId, variation, origin } = request;
    const errorMessages: string[] = [];

    this.#validateValue(value, errorMessages);
    this.#validateType(type, errorMessages);
    this.#validateName(name, errorMessages);
    this.#validateSourceId(sourceId, type, name, errorMessages);
    this.#validateVariation(variation, type, errorMessages);
    this.#validateOrigin(origin, name, errorMessages);

    if (errorMessages.length) {
      throw new Error(errorMessages.join(' '));
    }
  }

  #validateUpdateProposedNamesRequest(request: UpdateProposedNamesRequest) {
    const { value, type, sourceIds, variation } = request;
    const errorMessages: string[] = [];

    this.#validateValue(value, errorMessages);
    this.#validateType(type, errorMessages);
    this.#validateSourceIds(sourceIds, type, errorMessages);
    this.#validateDuplicateSourceIds(type, errorMessages);
    this.#validateVariation(variation, type, errorMessages);

    if (errorMessages.length) {
      throw new Error(errorMessages.join(' '));
    }
  }

  #validateValue(value: string, errorMessages: string[]) {
    if (!value?.length || typeof value !== 'string') {
      errorMessages.push('Must specify a non-empty string for value.');
    }
  }

  #validateType(type: NameType, errorMessages: string[]) {
    if (!Object.values(NameType).includes(type)) {
      errorMessages.push(
        `Must specify one of the following types: ${Object.values(
          NameType,
        ).join(', ')}`,
      );
    }
  }

  #validateName(name: string | null, errorMessages: string[]) {
    if (name === null) {
      return;
    }

    if (!name?.length || typeof name !== 'string') {
      errorMessages.push('Must specify a non-empty string or null for name.');
    }
  }

  #validateSourceIds(
    sourceIds: string[] | undefined,
    type: NameType,
    errorMessages: string[],
  ) {
    if (!sourceIds) {
      return;
    }

    const allSourceIds = this.#getAllSourceIds(type);
    const missingSourceIds = [];

    for (const sourceId of sourceIds) {
      if (!allSourceIds.includes(sourceId)) {
        missingSourceIds.push(sourceId);
        continue;
      }
    }

    if (missingSourceIds.length) {
      errorMessages.push(
        `Unknown source IDs for type '${type}': ${missingSourceIds.join(', ')}`,
      );
    }
  }

  #validateSourceId(
    sourceId: string | undefined,
    type: NameType,
    name: string | null,
    errorMessages: string[],
  ) {
    if (sourceId === null || sourceId === undefined) {
      return;
    }

    if (name === null) {
      errorMessages.push(
        `Cannot specify a source ID when clearing the saved name: ${sourceId}`,
      );
      return;
    }

    const allSourceIds = this.#getAllSourceIds(type);

    if (!sourceId.length || typeof sourceId !== 'string') {
      errorMessages.push('Must specify a non-empty string for sourceId.');
      return;
    }

    if (!allSourceIds.includes(sourceId)) {
      errorMessages.push(`Unknown source ID for type '${type}': ${sourceId}`);
    }
  }

  #validateDuplicateSourceIds(type: NameType, errorMessages: string[]) {
    const allSourceIds = this.#getAllSourceIds(type);

    const duplicateSourceIds = allSourceIds.filter(
      (sourceId, index) => allSourceIds.indexOf(sourceId) !== index,
    );

    if (duplicateSourceIds.length) {
      errorMessages.push(
        `Duplicate source IDs found for type '${type}': ${duplicateSourceIds.join(
          ', ',
        )}`,
      );
    }
  }

  #validateVariation(
    variation: string | undefined,
    type: string,
    errorMessages: string[],
  ) {
    if (type !== NameType.ETHEREUM_ADDRESS) {
      return;
    }

    if (
      !variation?.length ||
      typeof variation !== 'string' ||
      (!variation.match(/^0x[0-9A-Fa-f]+$/u) &&
        variation !== FALLBACK_VARIATION)
    ) {
      errorMessages.push(
        `Must specify a chain ID in hexidecimal format or the fallback, "${FALLBACK_VARIATION}", for variation when using '${type}' type.`,
      );
    }
  }

  #validateOrigin(
    origin: NameOrigin | null | undefined,
    name: string | null,
    errorMessages: string[],
  ) {
    if (!origin) {
      return;
    }

    if (name === null) {
      errorMessages.push(
        `Cannot specify an origin when clearing the saved name: ${origin}`,
      );
      return;
    }

    if (!Object.values(NameOrigin).includes(origin)) {
      errorMessages.push(
        `Must specify one of the following origins: ${Object.values(
          NameOrigin,
        ).join(', ')}`,
      );
    }
  }

  #getAllSourceIds(type: NameType): string[] {
    return (
      this.#providers
        /* istanbul ignore next */
        .map((provider) => this.#getSourceIds(provider, type))
        .flat()
    );
  }

  #getSourceIds(provider: NameProvider, type: NameType): string[] {
    return provider.getMetadata().sourceIds[type];
  }

  #removeDormantProposedNames(
    proposedNames: Record<string, ProposedNamesEntry>,
    type: NameType,
  ) {
    if (Object.keys(proposedNames).length === 0) {
      return;
    }

    const typeSourceIds = this.#getAllSourceIds(type);

    const dormantSourceIds = Object.keys(proposedNames).filter(
      (sourceId) => !typeSourceIds.includes(sourceId),
    );

    for (const dormantSourceId of dormantSourceIds) {
      delete proposedNames[dormantSourceId];
    }
  }

  #removeExpiredEntries(): void {
    const currentTime = this.#getCurrentTimeSeconds();

    this.update((state: NameControllerState) => {
      const entries = this.#getEntriesList(state);
      for (const { nameType, value, variation, entry } of entries) {
        if (entry.name !== null) {
          continue;
        }

        const proposedNames = Object.values(entry.proposedNames);
        const allProposedNamesExpired = proposedNames.every(
          (proposedName: ProposedNamesEntry) =>
            currentTime - (proposedName.lastRequestTime ?? 0) >=
            PROPOSED_NAME_EXPIRE_DURATION,
        );

        if (allProposedNamesExpired) {
          delete state.names[nameType][value][variation];
        }
      }
    });
  }

  #getEntriesList(state: NameControllerState): {
    nameType: NameType;
    value: string;
    variation: string;
    entry: NameEntry;
  }[] {
    return Object.entries(state.names).flatMap(([type, typeEntries]) =>
      Object.entries(typeEntries).flatMap(([value, variationEntries]) =>
        Object.entries(variationEntries).map(([variation, entry]) => ({
          entry,
          nameType: type as NameType,
          value,
          variation,
        })),
      ),
    );
  }
}
