import type { Eip1193Provider } from 'ethers';

import type { MockVariable } from '../__fixtures__/test-utils';
import type { Snap } from './messaging-signing-snap-requests';
import {
  MESSAGE_SIGNING_SNAP,
  SNAP_ORIGIN,
  connectSnap,
  getSnap,
  getSnaps,
} from './messaging-signing-snap-requests';

/**
 * Most of these utilities are wrappers around making wallet requests,
 * So only testing basic functionality.
 */

describe('connectSnap() tests', () => {
  it('tests invocation', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    await connectSnap(mockProvider);

    expect(mockRequest).toHaveBeenCalled();
  });
});

describe('getSnaps() tests', () => {
  it('tests invocation', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    await getSnaps(mockProvider);

    expect(mockRequest).toHaveBeenCalled();
  });
});

describe('getSnap() tests', () => {
  it('tests invocation', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();

    const mockSnap: Snap = { id: SNAP_ORIGIN } as MockVariable;
    mockRequest.mockResolvedValue({ [SNAP_ORIGIN]: mockSnap });

    const result = await getSnap(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('returns undefined if unable to find snap', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();

    const mockSnap: Snap = { id: 'A differentSnap' } as MockVariable;
    mockRequest.mockResolvedValue({ diffSnap: mockSnap });

    const result1 = await getSnap(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
    expect(result1).toBeUndefined();

    // Another test in case the wallet request returns null
    mockRequest.mockResolvedValue(null);
    const result2 = await getSnap(mockProvider);
    expect(result2).toBeUndefined();
  });

  it('returns undefined if an error is thrown when making provider request', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    mockRequest.mockRejectedValue(new Error('MOCK ERROR'));

    const result = await getSnap(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

describe('MESSAGE_SIGNING_SNAP.getPublicKey() tests', () => {
  it('tests invocation', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    await MESSAGE_SIGNING_SNAP.getPublicKey(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
  });
});

describe('MESSAGE_SIGNING_SNAP.signMessage() tests', () => {
  it('tests invocation', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    await MESSAGE_SIGNING_SNAP.signMessage(
      mockProvider,
      'metamask:someMessage',
    );
    expect(mockRequest).toHaveBeenCalled();
  });
});

/**
 * Mock utility - creates a mock provider
 * @returns mock provider
 */
function arrangeMockProvider() {
  const mockRequest = jest.fn();
  const mockProvider: Eip1193Provider = {
    request: mockRequest,
  };

  return { mockProvider, mockRequest };
}
