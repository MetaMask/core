import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import type { Patch } from 'immer';

import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
} from './types';
import { NameValueType } from './types';

const controllerName = 'NameController';

const stateMetadata = {
  names: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  names: { [NameValueType.ETHEREUM_ADDRESS]: {} },
});

export type NameEntry = {
  value: string;
  name: string | null;
  provider: string | null;
  proposed: Record<string, string>;
};

type NameControllerState = {
  names: Record<NameValueType, Record<string, NameEntry>>;
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
  messenger: NameControllerMessenger;
  providers: NameProvider[];
};

export type GetProposedNamesRequest = {
  value: string;
  type: NameValueType;
  providers?: string[];
};

export type GetProposedNamesResult = {
  proposed: Record<string, NameProviderResult>;
};

export type SetNameRequest = {
  value: string;
  type: NameValueType;
  name: string;
  provider?: string;
};

/**
 * Controller for storing and deriving names for values such as Ethereum addresses.
 */
export class NameController extends BaseControllerV2<
  typeof controllerName,
  NameControllerState,
  NameControllerMessenger
> {
  #providersById: { [id: string]: NameProvider };

  /**
   * Construct a Name controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the name controller.
   * @param options.providers -
   */
  constructor({ messenger, providers }: NameControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
    });

    this.#providersById = providers.reduce(
      (result: { [id: string]: NameProvider }, provider) => {
        const providerId = provider.getProviderId();

        if (result[providerId]) {
          throw new Error(
            `Duplicate name providers specified with ID: ${providerId}`,
          );
        }

        result[providerId] = provider;

        return result;
      },
      {},
    );
  }

  async getProposedNames({
    value,
    type,
    providers,
  }: GetProposedNamesRequest): Promise<GetProposedNamesResult> {
    const missingProviders: string[] = [];
    const invalidProviders: string[] = [];

    const providerInstances = providers
      ? providers.map((providerId) => {
          const provider = this.#providersById[providerId];

          if (!provider) {
            missingProviders.push(providerId);
            return provider;
          }

          if (!provider.supportsType(type)) {
            invalidProviders.push(providerId);
            return provider;
          }

          return provider;
        })
      : Object.values(this.#providersById);

    if (missingProviders.length) {
      throw new Error(
        `Name providers not found with IDs: ${missingProviders.join(', ')}`,
      );
    }

    if (invalidProviders.length) {
      throw new Error(
        `Name providers do not support the type '${type}': ${invalidProviders.join(
          ', ',
        )}`,
      );
    }

    const providerResults = await Promise.all(
      providerInstances.map(async (provider) => {
        const providerRequest: NameProviderRequest = {
          value,
          type,
        };

        try {
          return await provider.getName(providerRequest);
        } catch (error) {
          console.error('Failed to get proposed name', {
            provider,
            value,
            type,
            error,
          });

          return {
            provider: provider.getProviderId(),
            value,
            type,
            error,
          };
        }
      }),
    );

    const updatedProposedState = providerResults.reduce(
      (result: { [id: string]: string }, providerResult) => {
        if (providerResult.error) {
          return result;
        }

        result[providerResult.provider] = providerResult.name as string;
        return result;
      },
      {},
    );

    this.#updateEntry(value, type, { proposed: updatedProposedState });

    return providerResults.reduce(
      (result: GetProposedNamesResult, providerResult) => {
        result.proposed[providerResult.provider] = providerResult;
        return result;
      },
      { proposed: {} },
    );
  }

  setName(request: SetNameRequest) {
    const { value, type, name, provider } = request;
    this.#updateEntry(value, type, { name, provider: provider ?? null });
  }

  #updateEntry(value: string, type: NameValueType, data: Partial<NameEntry>) {
    this.update((state) => {
      const typeEntries = state.names[type];

      const currentEntry = typeEntries[value] ?? {
        value,
        proposed: {},
        name: null,
        provider: null,
      };

      const updatedEntry = { ...currentEntry, ...data };

      typeEntries[value] = updatedEntry;

      return state;
    });
  }
}
