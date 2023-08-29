import type {
  NameProvider,
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

  getProviderIds(): Record<NameType, string[]> {
    return { [NameType.ETHEREUM_ADDRESS]: [ID] };
  }

  getProviderLabel(_providerId: string): string {
    return LABEL;
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResponse> {
    const proposedName = await this.#reverseLookup(request.value);

    return {
      results: {
        [ID]: { proposedName },
      },
    };
  }
}
