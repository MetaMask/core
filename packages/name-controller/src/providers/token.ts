import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';

const ID = 'token';
const LABEL = 'Blockchain (Token Name)';

export class TokenNameProvider implements NameProvider {
  getMetadata(): NameProviderMetadata {
    return {
      providerIds: { [NameType.ETHEREUM_ADDRESS]: [ID] },
      providerLabels: { [ID]: LABEL },
    };
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResponse> {
    const { value, chainId } = request;
    const url = `https://token-api.metaswap.codefi.network/token/${chainId}?address=${value}`;
    const response = await fetch(url);
    const responseData = await response.json();
    const proposedName = responseData?.name;

    return {
      results: {
        [ID]: {
          proposedNames: [proposedName],
        },
      },
    };
  }
}
