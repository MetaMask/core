import {
  arrangeMockProvider,
  type MockVariable,
} from '../__fixtures__/test-utils';
import type { Snap } from './messaging-signing-snap-requests';
import {
  MESSAGE_SIGNING_SNAP,
  SNAP_ORIGIN,
  connectSnap,
  getSnaps,
  isSnapConnected,
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

describe('isSnapConnected() tests', () => {
  it('return true if snap is connected', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    const mockSnap: Snap = { id: SNAP_ORIGIN } as MockVariable;
    mockRequest.mockResolvedValue({ [SNAP_ORIGIN]: mockSnap });

    const isConnected = await isSnapConnected(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
    expect(isConnected).toBe(true);
  });

  it('return false if snap is NOT connected', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();

    const mockSnap: Snap = { id: 'A differentSnap' } as MockVariable;
    mockRequest.mockResolvedValue({ diffSnap: mockSnap });

    const isConnected = await isSnapConnected(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
    expect(isConnected).toBe(false);
  });

  it('return false if an error is thrown when making provider request', async () => {
    const { mockProvider, mockRequest } = arrangeMockProvider();
    mockRequest.mockRejectedValue(new Error('MOCK ERROR'));

    const isConnected = await isSnapConnected(mockProvider);
    expect(mockRequest).toHaveBeenCalled();
    expect(isConnected).toBe(false);
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
