import type { OriginalRequest } from '../types';
import { decodeSignature } from './decoding-api';

const PERMIT_REQUEST_MOCK = {
  method: 'eth_signTypedData_v4',
  params: [
    '0x975e73efb9ff52e23bac7f7e043a1ecd06d05477',
    '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Permit":[{"name":"owner","type":"address"},{"name":"spender","type":"address"},{"name":"value","type":"uint256"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}]},"primaryType":"Permit","domain":{"name":"MyToken","version":"1","verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC","chainId":1},"message":{"owner":"0x975e73efb9ff52e23bac7f7e043a1ecd06d05477","spender":"0x5B38Da6a701c568545dCfcB03FcB875f56beddC4","value":3000,"nonce":0,"deadline":50000000000}}',
  ],
  jsonrpc: '2.0',
  id: 1680528590,
  origin: 'https://metamask.github.io',
  networkClientId: 'mainnet',
  tabId: 1048807181,
  traceContext: null,
};

const MOCK_RESULT = {
  stateChanges: [
    {
      assetType: 'ERC20',
      changeType: 'APPROVE',
      address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
      amount: '1461501637330902918203684832716283019655932542975',
      contractAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
    },
  ],
};

const MOCK_ERROR = {
  error: {
    message:
      'Unsupported signature. Please contact our team about adding support.',
    type: 'UNSUPPORTED_SIGNATURE',
  },
};

describe('Decoding api', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  /**
   * Mock a JSON response from fetch.
   * @param jsonResponse - The response body to return.
   */
  function mockFetchResponse(jsonResponse: unknown) {
    fetchMock.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue(jsonResponse),
    } as unknown as Response);
  }

  it('return the data from api', async () => {
    fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;
    mockFetchResponse(MOCK_RESULT);

    const result = await decodeSignature(
      PERMIT_REQUEST_MOCK,
      '0x1',
      'https://testdecodingurl.com',
    );

    expect(result.stateChanges).toStrictEqual(MOCK_RESULT.stateChanges);
  });

  it('return error from the api as it is', async () => {
    fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;
    mockFetchResponse(MOCK_ERROR);

    const result = await decodeSignature(
      PERMIT_REQUEST_MOCK,
      '0x1',
      'https://testdecodingurl.com',
    );

    expect(result.error).toStrictEqual(MOCK_ERROR.error);
  });

  it('return failure error if there is an exception while validating', async () => {
    const result = await decodeSignature(
      PERMIT_REQUEST_MOCK,
      '0x1',
      'https://testdecodingurl.com',
    );

    expect(result.error.type).toBe('DECODING_FAILED_WITH_ERROR');
  });

  it('return undefined for request not of method eth_signTypedData_v4', async () => {
    const result = await decodeSignature(
      { method: 'eth_signTypedData_v3' } as OriginalRequest,
      '0x1',
      'https://testdecodingurl.com',
    );

    expect(result.error.type).toBe('UNSUPPORTED_SIGNATURE');
  });
});
