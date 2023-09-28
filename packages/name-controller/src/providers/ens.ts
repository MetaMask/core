import { projectLogger, createModuleLogger } from '../logger';
import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameType } from '../types';

export type ReverseLookupCallback = (
  address: string,
  chainId: string,
) => Promise<string>;

const ID = 'ens';
const LABEL = 'Ethereum Name Service (ENS)';

const log = createModuleLogger(projectLogger, 'ens');

export class ENSNameProvider implements NameProvider {
  #isEnabled: () => boolean;

  #reverseLookup: ReverseLookupCallback;

  constructor({
    isEnabled,
    reverseLookup,
  }: {
    isEnabled?: () => boolean;
    reverseLookup: ReverseLookupCallback;
  }) {
    this.#isEnabled = isEnabled || (() => true);
    this.#reverseLookup = reverseLookup;
  }

  getMetadata(): NameProviderMetadata {
    return {
      sourceIds: { [NameType.ETHEREUM_ADDRESS]: [ID] },
      sourceLabels: { [ID]: LABEL },
    };
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResult> {
    if (!this.#isEnabled()) {
      log('Skipping request as disabled');

      return {
        results: {
          [ID]: {
            proposedNames: [],
          },
        },
      };
    }

    const { value, variation: chainId } = request;

    log('Invoking callback', { value, chainId });

    try {
      const proposedName = await this.#reverseLookup(value, chainId);
      const proposedNames = proposedName ? [proposedName] : [];

      log('New proposed names', proposedNames);

      return {
        results: {
          [ID]: { proposedNames },
        },
      };
    } catch (error) {
      log('Request failed', error);
      throw error;
    }
  }
}
