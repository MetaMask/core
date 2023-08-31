import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameType } from '../types';
import { handleFetch } from '../util';

const ID = 'token';
const LABEL = 'Blockchain (Token Name)';

export class TokenNameProvider implements NameProvider {
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
    const url = `https://token-api.metaswap.codefi.network/token/${chainId}?address=${value}`;
    const responseData = await handleFetch(url);
    const proposedName = responseData.name;

    return {
      results: {
        [ID]: {
          proposedNames: [proposedName],
        },
      },
    };
  }
}
