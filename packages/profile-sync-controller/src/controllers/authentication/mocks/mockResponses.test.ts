import {
  getMockAuthAccessTokenResponse,
  getE2EIdentifierFromJwt,
  MOCK_OATH_TOKEN_RESPONSE,
} from './mockResponses';

describe('getE2EIdentifierFromJwt()', () => {
  it('extracts the sub claim from a valid mock JWT', () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({ sub: 'MOCK_SRP_IDENTIFIER_1', exp: 4102444800 }),
    );
    const jwt = `${header}.${payload}.mock`;

    expect(getE2EIdentifierFromJwt(jwt)).toBe('MOCK_SRP_IDENTIFIER_1');
  });

  it('returns the raw token when it is not a JWT', () => {
    expect(getE2EIdentifierFromJwt('MOCK_SRP_IDENTIFIER_1')).toBe(
      'MOCK_SRP_IDENTIFIER_1',
    );
  });

  it('returns the raw token for an empty string', () => {
    expect(getE2EIdentifierFromJwt('')).toBe('');
  });

  it('returns the raw token when JWT payload has no sub claim', () => {
    const header = btoa(JSON.stringify({ alg: 'none' }));
    const payload = btoa(JSON.stringify({ exp: 4102444800 }));
    const jwt = `${header}.${payload}.mock`;

    expect(getE2EIdentifierFromJwt(jwt)).toBe(jwt);
  });

  it('returns the raw token when JWT payload has invalid base64', () => {
    expect(getE2EIdentifierFromJwt('a.!!!invalid!!!.b')).toBe(
      'a.!!!invalid!!!.b',
    );
  });
});

describe('getMockAuthAccessTokenResponse()', () => {
  it('wraps the e2eIdentifier in a JWT when assertion is present', () => {
    const mock = getMockAuthAccessTokenResponse();
    const response =
      // eslint-disable-next-line @typescript-eslint/naming-convention
      (mock.response as (body?: string) => { access_token: string })(
        'assertion=MOCK_SRP_IDENTIFIER_1',
      );

    const token = response.access_token;
    expect(token.split('.')).toHaveLength(3);
    expect(getE2EIdentifierFromJwt(token)).toBe('MOCK_SRP_IDENTIFIER_1');
  });

  it('returns the default OIDC access token when no assertion is present', () => {
    const mock = getMockAuthAccessTokenResponse();
    const response =
      // eslint-disable-next-line @typescript-eslint/naming-convention
      (mock.response as (body?: string) => { access_token: string })('');

    expect(response.access_token).toBe(MOCK_OATH_TOKEN_RESPONSE.access_token);
  });

  it('produces JWTs with a far-future exp claim', () => {
    const mock = getMockAuthAccessTokenResponse();
    const response =
      // eslint-disable-next-line @typescript-eslint/naming-convention
      (mock.response as (body?: string) => { access_token: string })(
        'assertion=test-id',
      );

    const payload = JSON.parse(atob(response.access_token.split('.')[1]));
    expect(payload.exp).toBe(4102444800);
  });
});
