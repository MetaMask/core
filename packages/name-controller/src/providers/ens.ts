import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';

export type ReverseLookupCallback = (address: string) => Promise<string>;

const ID = 'ens';
const LABEL = 'Ethereum Name Service (ENS)';

export class ENSNameProvider implements NameProvider {
  #reverseLookup: ReverseLookupCallback;

  constructor({ reverseLookup }: { reverseLookup: ReverseLookupCallback }) {
    this.#reverseLookup = reverseLookup;
  }

  getMetadata(): NameProviderMetadata {
    return {
      providerIds: { [NameType.ETHEREUM_ADDRESS]: [ID] },
      providerLabels: { [ID]: LABEL },
    };
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResponse> {
    const proposedName = await this.#reverseLookup(request.value);

    return {
      results: {
        [ID]: { proposedNames: [proposedName] },
      },
    };
  }
}
