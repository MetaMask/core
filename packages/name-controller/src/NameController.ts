import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import type { Patch } from 'immer';

import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
} from './types';
import { NameType } from './types';

const controllerName = 'NameController';

const stateMetadata = {
  names: { persist: true, anonymous: false },
  nameProviders: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  names: {
    [NameType.ETHEREUM_ADDRESS]: {},
  },
  nameProviders: {},
});

export type NameEntry = {
  name: string | null;
  sourceId: string | null;
  proposedNames: Record<string, string[] | null>;
};

export type ProviderEntry = {
  label: string;
};

export type NameControllerState = {
  names: Record<NameType, Record<string, NameEntry>>;
  nameProviders: Record<string, ProviderEntry>;
};

export type GetNameState = {
  type: `${typeof controllerName}:getState`;
  handler: () => NameControllerState;
};

export type NameStateChange = {
  type: `${typeof controllerName}:stateChange`;
  payload: [NameControllerState, Patch[]];
};

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
  getChainId: () => string;
  messenger: NameControllerMessenger;
  providers: NameProvider[];
};

export type UpdateProposedNamesRequest = {
  value: string;
  type: NameType;
  sourceIds?: string[];
};

export type UpdateProposedNamesResult = {
  results: Record<string, { proposedNames?: string[]; error?: unknown }>;
};

export type SetNameRequest = {
  value: string;
  type: NameType;
  name: string;
  sourceId?: string;
};

/**
 * Controller for storing and deriving names for values such as Ethereum addresses.
 */
export class NameController extends BaseControllerV2<
  typeof controllerName,
  NameControllerState,
  NameControllerMessenger
> {
  #getChainId: () => string;

  #providers: NameProvider[];

  /**
   * Construct a Name controller.
   *
   * @param options - Controller options.
   * @param options.getChainId - Callback that returns the chain ID of the current network.
   * @param options.messenger - Restricted controller messenger for the name controller.
   * @param options.providers - Array of name provider instances to propose names.
   */
  constructor({ getChainId, messenger, providers }: NameControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
    });

    this.#getChainId = getChainId;
    this.#providers = providers;
  }

  /**
   * Set the user specified name for a value.
   *
   * @param request - Request object.
   * @param request.name - Name to set.
   * @param request.sourceId - Optional ID of the source of the proposed name.
   * @param request.type - Type of value to set the name for.
   * @param request.value - Value to set the name for.
   */
  setName(request: SetNameRequest) {
    this.#validateSetNameRequest(request);

    const { value, type, name, sourceId } = request;

    this.#updateEntry(value, type, { name, sourceId: sourceId ?? null });
  }

  /**
   * Generate the proposed names for a value using the name providers and store them in the state.
   *
   * @param request - Request object.
   * @param request.value - Value to update the proposed names for.
   * @param request.type - Type of value to update the proposed names for.
   * @param request.sourceIds - Optional array of source IDs to limit which sources are used by the providers. If not provided, all sources in all providers will be used.
   * @returns The updated proposed names for the value.
   */
  async updateProposedNames(
    request: UpdateProposedNamesRequest,
  ): Promise<UpdateProposedNamesResult> {
    this.#validateUpdateProposedNamesRequest(request);

    const chainId = this.#getChainId();

    const providerResponses = (
      await Promise.all(
        this.#providers.map((provider) =>
          this.#getProviderResponse(request, chainId, provider),
        ),
      )
    ).filter((response) => Boolean(response)) as NameProviderResult[];

    this.#updateProposedNameState(request, providerResponses);
    this.#updateProviderState(this.#providers);

    return this.#getUpdateProposedNamesResult(providerResponses);
  }

  #updateProposedNameState(
    request: UpdateProposedNamesRequest,
    providerResponses: NameProviderResult[],
  ) {
    const { value, type } = request;
    const newProposedNames: { [sourceId: string]: string[] | null } = {};

    for (const providerResponse of providerResponses) {
      const { results, error: responseError } = providerResponse;

      if (responseError) {
        continue;
      }

      for (const sourceId of Object.keys(providerResponse.results)) {
        const result = results[sourceId];
        const { proposedNames } = result;
        let finalProposedNames = result.error ? null : proposedNames ?? [];

        if (finalProposedNames) {
          finalProposedNames = finalProposedNames.filter(
            (proposedName) => proposedName?.length,
          );
        }

        newProposedNames[sourceId] = finalProposedNames;
      }
    }

    const proposedNames = {
      ...this.state.names[type]?.[value]?.proposedNames,
      ...newProposedNames,
    };

    this.#updateEntry(value, type, { proposedNames });
  }

  #updateProviderState(providers: NameProvider[]) {
    const newNameProviders = { ...this.state.nameProviders };

    for (const provider of providers) {
      const { sourceLabels } = provider.getMetadata();

      for (const sourceId of Object.keys(sourceLabels)) {
        newNameProviders[sourceId] = {
          label: sourceLabels[sourceId],
        };
      }
    }

    this.update((state) => {
      state.nameProviders = newNameProviders;
    });
  }

  #getUpdateProposedNamesResult(
    providerResponses: NameProviderResult[],
  ): UpdateProposedNamesResult {
    return providerResponses.reduce(
      (acc: UpdateProposedNamesResult, providerResponse) => {
        const { results } = providerResponse;

        for (const sourceId of Object.keys(results)) {
          const { proposedNames: resultProposedNames, error: resultError } =
            results[sourceId];

          let proposedNames = resultError
            ? undefined
            : resultProposedNames ?? [];

          if (proposedNames) {
            proposedNames = proposedNames.filter(
              (proposedName) => proposedName?.length,
            );
          }

          acc.results[sourceId] = {
            proposedNames,
            error: resultError,
          };
        }

        return acc;
      },
      { results: {} },
    );
  }

  async #getProviderResponse(
    request: UpdateProposedNamesRequest,
    chainId: string,
    provider: NameProvider,
  ): Promise<NameProviderResult | undefined> {
    const { value, type, sourceIds: requestedSourceIds } = request;
    const supportedSourceIds = this.#getSourceIds(provider, type);

    const matchingSourceIds =
      requestedSourceIds?.filter((sourceId) =>
        supportedSourceIds.includes(sourceId),
      ) ?? supportedSourceIds;

    if (requestedSourceIds && !matchingSourceIds.length) {
      return undefined;
    }

    const providerRequest: NameProviderRequest = {
      chainId,
      value,
      type,
      sourceIds: requestedSourceIds ? matchingSourceIds : undefined,
    };

    let responseError: unknown | undefined;
    let response: NameProviderResult | undefined;

    try {
      response = await provider.getProposedNames(providerRequest);
      responseError = response.error;
    } catch (error) {
      responseError = error;
    }

    let results = {};

    if (response?.results) {
      results = Object.keys(response.results).reduce(
        (acc: NameProviderResult['results'], sourceId) => {
          if (!requestedSourceIds || requestedSourceIds.includes(sourceId)) {
            acc[sourceId] = (response as NameProviderResult).results[sourceId];
          }

          return acc;
        },
        {},
      );
    }

    if (responseError) {
      results = supportedSourceIds.reduce(
        (acc: NameProviderResult['results'], sourceId) => {
          acc[sourceId] = { proposedNames: [], error: responseError };
          return acc;
        },
        {},
      );
    }

    return { results, error: responseError };
  }

  #updateEntry(value: string, type: NameType, data: Partial<NameEntry>) {
    this.update((state) => {
      const typeEntries = state.names[type] || {};
      state.names[type] = typeEntries;

      const currentEntry = typeEntries[value] ?? {
        proposedNames: {},
        name: null,
        sourceId: null,
      };

      const updatedEntry = { ...currentEntry, ...data };

      typeEntries[value] = updatedEntry;
    });
  }

  #validateSetNameRequest(request: SetNameRequest) {
    const { name, value, type, sourceId } = request;
    const errorMessages: string[] = [];

    this.#validateValue(value, errorMessages);
    this.#validateType(type, errorMessages);
    this.#validateName(name, errorMessages);
    this.#validateSourceId(sourceId, type, errorMessages);

    if (errorMessages.length) {
      throw new Error(errorMessages.join(' '));
    }
  }

  #validateUpdateProposedNamesRequest(request: UpdateProposedNamesRequest) {
    const { value, type, sourceIds } = request;
    const errorMessages: string[] = [];

    this.#validateValue(value, errorMessages);
    this.#validateType(type, errorMessages);
    this.#validateSourceIds(sourceIds, type, errorMessages);
    this.#validateDuplicateSourceIds(type, errorMessages);

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

  #validateName(name: string, errorMessages: string[]) {
    if (!name?.length || typeof name !== 'string') {
      errorMessages.push('Must specify a non-empty string for name.');
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
    errorMessages: string[],
  ) {
    if (sourceId === null || sourceId === undefined) {
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
}
