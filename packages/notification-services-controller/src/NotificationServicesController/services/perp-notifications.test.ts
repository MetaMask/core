import { createPerpOrderNotification } from './perp-notifications';
import { mockCreatePerpNotification } from '../__fixtures__/mockServices';
import type { OrderInput } from '../types/perps';

const mockOrderInput = (): OrderInput => ({
  user_id: '0x111', // User Address
  coin: '0x222', // Asset address
});

const mockBearerToken = 'mock-jwt-token';

describe('Perps Service - createPerpOrderNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const arrangeMocks = () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(jest.fn());

    return { consoleErrorSpy };
  };

  it('should successfully create a perp order notification', async () => {
    const { consoleErrorSpy } = arrangeMocks();
    const mockEndpoint = mockCreatePerpNotification();
    await createPerpOrderNotification(mockBearerToken, mockOrderInput());

    expect(mockEndpoint.isDone()).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle fetch errors gracefully', async () => {
    const { consoleErrorSpy } = arrangeMocks();
    const mockEndpoint = mockCreatePerpNotification({ status: 500 });
    let numberOfRequests = 0;
    mockEndpoint.on('request', () => (numberOfRequests += 1));

    await createPerpOrderNotification(mockBearerToken, mockOrderInput());

    expect(mockEndpoint.isDone()).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(numberOfRequests).toBe(4); // 4 requests made - 1 initial + 3 retries
  });
});
