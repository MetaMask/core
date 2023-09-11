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

export class ENSNameProvider implements NameProvider {
  #reverseLookup: ReverseLookupCallback;

  constructor({ reverseLookup }: { reverseLookup: ReverseLookupCallback }) {
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
    const { value, chainId } = request;
    const proposedName = await this.#reverseLookup(value, chainId);

    return {
      results: {
        [ID]: { proposedNames: [proposedName] },
      },
    };
  }
}
