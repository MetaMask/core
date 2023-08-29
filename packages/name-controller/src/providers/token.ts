import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';

const ID = 'token';
const LABEL = 'Blockchain (Token Name)';

export class TokenNameProvider implements NameProvider {
  getProviderIds(): Record<NameType, string[]> {
    return { [NameType.ETHEREUM_ADDRESS]: [ID] };
  }

  getProviderLabel(_providerId: string): string {
    return LABEL;
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
          proposedName,
        },
      },
    };
  }
}
