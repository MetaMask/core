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
  getMetadata(): NameProviderMetadata {
    return {
      sourceIds: { [NameType.ETHEREUM_ADDRESS]: [ID] },
      sourceLabels: { [ID]: LABEL },
    };
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResult> {
    const { value } = request;

    const responseData = await graphQL<LensResponse>(LENS_URL, QUERY, {
      address: value,
    });

    const profiles = responseData?.profiles?.items ?? [];
    const proposedNames = profiles.map((profile) => profile.handle);

    return {
      results: {
        [ID]: {
          proposedNames,
        },
      },
    };
  }
}
