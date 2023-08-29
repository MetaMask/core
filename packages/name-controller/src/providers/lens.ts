import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';

const ID = 'lens';
const LABEL = 'Lens Protocol';

export class LensNameProvider implements NameProvider {
  getProviderIds(): Record<string, string[]> {
    return { [NameType.ETHEREUM_ADDRESS]: [ID] };
  }

  getProviderLabel(_providerId: string): string {
    return LABEL;
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

    const profile = responseData?.data?.profiles?.items?.[0];
    const proposedName = profile?.handle;

    return {
      results: {
        [ID]: {
          proposedName,
        },
      },
    };
  }
}
