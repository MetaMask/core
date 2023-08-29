import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';

const ID = 'etherscan';
const LABEL = 'Etherscan (Verified Contract Name)';

export class EtherscanNameProvider implements NameProvider {
  #apiKey?: string;

  constructor({ apiKey }: { apiKey?: string }) {
    this.#apiKey = apiKey;
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
    const { value } = request;

    let url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${value}`;

    if (this.#apiKey) {
      url += `&apikey=${this.#apiKey}`;
    }

    const response = await fetch(url);
    const responseData = await response.json();
    const proposedName = responseData?.result?.[0]?.ContractName;

    return {
      results: {
        [ID]: {
          proposedNames: [proposedName],
        },
      },
    };
  }
}
