import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import type { Patch } from 'immer';

import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResponse,
} from './types';
import { NameType } from './types';

const controllerName = 'NameController';

const stateMetadata = {
  names: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  names: {
    [NameType.ETHEREUM_ADDRESS]: {},
  },
});

export type NameEntry = {
  name: string | null;
  providerId: string | null;
  proposedNames: Record<string, string | null>;
};

export type NameControllerState = {
  names: Record<NameType, Record<string, NameEntry>>;
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
  providerIds?: string[];
};

export type UpdateProposedNamesResult = {
  results: Record<string, { proposedName?: string; error: unknown }>;
};

export type SetNameRequest = {
  value: string;
  type: NameType;
  name: string;
  providerId?: string;
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
   * @param request.providerId - Optional ID of the provider that proposed the name.
   * @param request.type - Type of value to set the name for.
   * @param request.value - Value to set the name for.
   */
  setName(request: SetNameRequest) {
    const { value, type, name, providerId } = request;
    this.#updateEntry(value, type, { name, providerId: providerId ?? null });
  }

  /**
   * Generate the proposed names for a value using the name providers and store them in the state.
   *
   * @param request - Request object.
   * @param request.value - Value to update the proposed names for.
   * @param request.type - Type of value to update the proposed names for.
   * @param request.providerIds - Optional array of provider IDs to limit which providers are used. If not provided, all providers will be used.
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
    ).filter((response) => Boolean(response)) as NameProviderResponse[];

    this.#updateProposedNameState(request, providerResponses);

    return this.#getUpdateProposedNamesResult(providerResponses);
  }

  #updateProposedNameState(
    request: UpdateProposedNamesRequest,
    providerResponses: NameProviderResponse[],
  ) {
    const { value, type } = request;
    const newProposedNames: { [providerId: string]: string | null } = {};

    for (const providerResponse of providerResponses) {
      const { results, error: responseError } = providerResponse;

      if (responseError) {
        continue;
      }

      for (const providerId of Object.keys(providerResponse.results)) {
        const result = results[providerId];
        const { proposedName, error: resultError } = result;

        newProposedNames[providerId] =
          proposedName?.length && !resultError ? proposedName : null;
      }
    }

    const proposedNames = {
      ...this.state.names[type]?.[value]?.proposedNames,
      ...newProposedNames,
    };

    this.#updateEntry(value, type, { proposedNames });
  }

  #getUpdateProposedNamesResult(
    providerResponses: NameProviderResponse[],
  ): UpdateProposedNamesResult {
    return providerResponses.reduce(
      (acc: UpdateProposedNamesResult, providerResponse) => {
        const { results, error: responseError } = providerResponse;

        if (responseError) {
          return acc;
        }

        for (const providerId of Object.keys(results)) {
          const { proposedName, error: resultError } = results[providerId];

          acc.results[providerId] = {
            proposedName,
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
  ): Promise<NameProviderResponse | undefined> {
    const { value, type, providerIds: requestedProviderIds } = request;
    const providerIds = provider.getProviderIds()?.[type] || [];

    const relevantProviderIds =
      requestedProviderIds?.filter((providerId) =>
        providerIds.includes(providerId),
      ) ?? [];

    if (requestedProviderIds && !relevantProviderIds.length) {
      return undefined;
    }

    const providerRequest: NameProviderRequest = {
      chainId,
      value,
      type,
      providerIds: relevantProviderIds,
    };

    try {
      const response = await provider.getProposedNames(providerRequest);

      if (response.error) {
        return { results: {}, error: response.error };
      }

      return {
        results: Object.keys(response.results).reduce(
          (acc: any, providerId) => {
            if (
              !requestedProviderIds ||
              requestedProviderIds?.includes(providerId)
            ) {
              acc[providerId] = response.results[providerId];
            }

            return acc;
          },
          {},
        ),
      };
    } catch (error) {
      console.error('Failed to get proposed names', {
        value,
        type,
        error,
      });

      return { results: {}, error };
    }
  }

  #updateEntry(value: string, type: NameType, data: Partial<NameEntry>) {
    this.update((state) => {
      const typeEntries = state.names[type];

      const currentEntry = typeEntries?.[value] ?? {
        proposedNames: {},
        name: null,
        providerId: null,
      };

      const updatedEntry = { ...currentEntry, ...data };

      typeEntries[value] = updatedEntry;
    });
  }

  #validateUpdateProposedNamesRequest(request: UpdateProposedNamesRequest) {
    const { value, type, providerIds } = request;

    const errorMessages: string[] = [];

    if (!value?.length || typeof value !== 'string') {
      errorMessages.push('Must specify a non-empty string value.');
    }

    if (!Object.values(NameType).includes(type)) {
      errorMessages.push(
        `Must specify one of the following types: ${Object.values(
          NameType,
        ).join(', ')}`,
      );
    }

    if (providerIds) {
      const allProviderIds = this.#getAllProviderIds(type);
      const missingProviderIds = [];

      for (const providerId of providerIds) {
        if (!allProviderIds.includes(providerId)) {
          missingProviderIds.push(providerId);
          continue;
        }
      }

      if (missingProviderIds.length) {
        errorMessages.push(
          `Unknown name provider IDs for type '${type}': ${missingProviderIds.join(
            ', ',
          )}`,
        );
      }
    }

    if (errorMessages.length) {
      throw new Error(errorMessages.join(' '));
    }
  }

  #getAllProviderIds(type: NameType): string[] {
    return this.#providers
      .map((provider) => provider.getProviderIds()?.[type] || [])
      .flat();
  }
}
