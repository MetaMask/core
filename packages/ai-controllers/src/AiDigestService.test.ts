import { AiDigestService } from '.';

const mockData = {
  summary: 'Test summary',
  analysis: 'Test analysis',
};

describe('AiDigestService', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('fetches digest from API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockData }),
    });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });
    const result = await service.fetchDigest('ethereum');

    expect(result).toStrictEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith('http://test.com/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'ethereum', provider: 'litellm' }),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });

    await expect(service.fetchDigest('ethereum')).rejects.toThrow('API request failed: 500');
  });

  it('throws on API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: { message: 'Invalid asset' } }),
    });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });

    await expect(service.fetchDigest('invalid')).rejects.toThrow('Invalid asset');
  });

  it('throws default error when no message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });

    await expect(service.fetchDigest('invalid')).rejects.toThrow('API returned error');
  });
});
