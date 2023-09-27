import { createModuleLogger, projectLogger } from '../logger';
import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameType } from '../types';
import { graphQL } from '../util';

const ID = 'lens';
const LABEL = 'Lens Protocol';
const LENS_URL = `https://api.lens.dev`;

const QUERY = `
query HandlesForAddress($address: EthereumAddress!) {
  profiles(request: { ownedBy: [$address] }) {
    items {
      handle
    }
  }
}`;

const log = createModuleLogger(projectLogger, 'lens');

type LensResponse = {
  profiles: {
    items: [
      {
        handle: string;
      },
    ];
  };
};

export class LensNameProvider implements NameProvider {
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

    const { value } = request;
    const variables = { address: value };

    log('Sending request', { variables });

    try {
      const responseData = await graphQL<LensResponse>(
        LENS_URL,
        QUERY,
        variables,
      );

      const profiles = responseData?.profiles?.items ?? [];
      const proposedNames = profiles.map((profile) => profile.handle);

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
