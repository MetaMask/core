import { getErrorFromResponse, createSentryError } from './utils';

describe('getErrorFromResponse', () => {
  it('returns error with message from JSON response', async () => {
    const response = {
      status: 400,
      json: jest.fn().mockResolvedValue({ error: 'Bad request' }),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);

    expect(error.message).toBe('error: Bad request, statusCode: 400');
  });

  it('returns generic HTTP error when JSON parsing fails', async () => {
    const response = {
      status: 500,
      json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);

    expect(error.message).toBe('HTTP 500 error');
  });
});

describe('createSentryError', () => {
  it('creates error with message and cause', () => {
    const cause = new Error('Original error');
    const error = createSentryError('Something went wrong', cause);

    expect(error.message).toBe('Something went wrong');
    expect((error as Error & { cause: Error }).cause).toBe(cause);
  });
});
