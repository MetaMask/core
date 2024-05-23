import { createModuleLogger, projectLogger } from '../logger';
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

const log = createModuleLogger(projectLogger, 'token');

export class TokenNameProvider implements NameProvider {
  #isEnabled: () => boolean;

  constructor({ isEnabled }: { isEnabled?: () => boolean } = {}) {
    this.#isEnabled = isEnabled || (() => true);
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
    const url = `https://token.api.cx.metamask.io/token/${chainId}?address=${value}`;

    log('Sending request', url);

    try {
      const responseData = await handleFetch(url);
      const proposedName = responseData.name;
      const proposedNames = proposedName ? [proposedName] : [];

      log('New proposed names', proposedNames);

      return {
        results: {
          [ID]: {
            proposedNames,
          },
        },
      };
    } catch (error) {
      log('Request failed', error);
      throw error;
    }
  }
}
