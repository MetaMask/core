import { describe, expect, it } from 'vitest';

import {
  addRampsClientIdentityParams,
  isRampsClientBuild,
  RampsClientBuild,
} from './client-identity.js';
import type { RampsClientIdentity } from './client-identity.js';

const BASE_URL = 'https://on-ramp.api.cx.metamask.io/regions/countries';

describe('addRampsClientIdentityParams', () => {
  it('appends all identity fields as query params', () => {
    const url = new URL(BASE_URL);

    addRampsClientIdentityParams(url, {
      clientProduct: 'metamask-mobile',
      clientVersion: '8.9.0',
      clientBuild: RampsClientBuild.ReleaseCandidate,
    });

    expect(url.searchParams.get('clientProduct')).toBe('metamask-mobile');
    expect(url.searchParams.get('clientVersion')).toBe('8.9.0');
    expect(url.searchParams.get('clientBuild')).toBe('rc');
  });

  it('leaves the URL untouched when no identity is provided', () => {
    const url = new URL(BASE_URL);

    addRampsClientIdentityParams(url, {});

    expect(url.search).toBe('');
  });

  it('omits empty string values', () => {
    const url = new URL(BASE_URL);

    addRampsClientIdentityParams(url, {
      clientProduct: '',
      clientVersion: '8.9.0',
    });

    expect(url.searchParams.has('clientProduct')).toBe(false);
    expect(url.searchParams.get('clientVersion')).toBe('8.9.0');
  });

  it('sends prod for a production build', () => {
    const url = new URL(BASE_URL);

    addRampsClientIdentityParams(url, {
      clientBuild: RampsClientBuild.Production,
    });

    expect(url.searchParams.get('clientBuild')).toBe('prod');
  });

  it.each(['', 'RC', 'beta', 'production', 'rc '])(
    'omits clientBuild for the unknown value %j so the API treats the request as production',
    (clientBuild) => {
      const url = new URL(BASE_URL);

      addRampsClientIdentityParams(url, {
        clientVersion: '8.9.0',
        clientBuild,
      } as unknown as RampsClientIdentity);

      expect(url.searchParams.has('clientBuild')).toBe(false);
      expect(url.searchParams.get('clientVersion')).toBe('8.9.0');
    },
  );
});

describe('isRampsClientBuild', () => {
  it.each(['rc', 'prod'])('accepts %j', (value) => {
    expect(isRampsClientBuild(value)).toBe(true);
  });

  it.each([undefined, null, 1, '', 'RC', 'ga'])('rejects %j', (value) => {
    expect(isRampsClientBuild(value)).toBe(false);
  });
});
