import { addRampsClientIdentityParams } from './client-identity.js';

describe('addRampsClientIdentityParams', () => {
  it('appends all identity fields as query params', () => {
    const url = new URL('https://on-ramp.api.cx.metamask.io/regions/countries');

    addRampsClientIdentityParams(url, {
      clientProduct: 'metamask-mobile',
      clientVersion: '8.9.0',
    });

    expect(url.searchParams.get('clientProduct')).toBe('metamask-mobile');
    expect(url.searchParams.get('clientVersion')).toBe('8.9.0');
  });

  it('leaves the URL untouched when no identity is provided', () => {
    const url = new URL('https://on-ramp.api.cx.metamask.io/regions/countries');

    addRampsClientIdentityParams(url, {});

    expect(url.search).toBe('');
  });

  it('omits empty string values', () => {
    const url = new URL('https://on-ramp.api.cx.metamask.io/regions/countries');

    addRampsClientIdentityParams(url, {
      clientProduct: '',
      clientVersion: '8.9.0',
    });

    expect(url.searchParams.has('clientProduct')).toBe(false);
    expect(url.searchParams.get('clientVersion')).toBe('8.9.0');
  });
});
