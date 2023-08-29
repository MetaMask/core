import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';

const ID = 'lens';
const LABEL = 'Lens Protocol';

export class LensNameProvider implements NameProvider {
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
    const url = `https://api.lens.dev`;

    const body = JSON.stringify({
      query: `query Profiles {  profiles(request: { ownedBy: ["${value}"], limit: 1 }) {    items {      name      handle    }  }}`,
    });

    const response = await fetch(url, {
      body,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const responseData = await response.json();

    const profiles = responseData?.data?.profiles?.items;
    const proposedNames = profiles?.map((profile: any) => profile.handle);

    return {
      results: {
        [ID]: {
          proposedNames,
        },
      },
    };
  }
}
