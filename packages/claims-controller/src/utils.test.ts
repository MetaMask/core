import { getErrorFromResponse, createSentryError } from './utils';

describe('getErrorFromResponse', () => {
  it('returns error with message from JSON response', async () => {
    const response = {
      status: 400,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: jest.fn().mockResolvedValue({ error: 'Bad request' }),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);

    expect(error.message).toBe('error: Bad request, statusCode: 400');
  });

  it('returns error with message from JSON response when message is present', async () => {
    const response = {
      status: 400,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: jest.fn().mockResolvedValue({ message: 'Bad request' }),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);
    expect(error.message).toBe('error: Bad request, statusCode: 400');
  });

  it('returns unknown error when JSON response has no error or message', async () => {
    const response = {
      status: 400,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);
    expect(error.message).toBe('error: Unknown error, statusCode: 400');
  });

  it('returns error with message from text/plain response', async () => {
    const response = {
      status: 400,
      headers: {
        get: jest.fn().mockReturnValue('text/plain'),
      },
      text: jest.fn().mockResolvedValue('Plain text error'),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);
    expect(error.message).toBe('error: Plain text error, statusCode: 400');
  });

  it('returns error with data property when content-type is unknown', async () => {
    const response = {
      status: 400,
      headers: {
        get: jest.fn().mockReturnValue('application/octet-stream'),
      },
      data: 'Some data error',
    } as unknown as Response;

    const error = await getErrorFromResponse(response);
    expect(error.message).toBe('error: Some data error, statusCode: 400');
  });

  it('returns unknown error when content-type is unknown and no data property', async () => {
    const response = {
      status: 400,
      headers: {
        get: jest.fn().mockReturnValue('application/octet-stream'),
      },
    } as unknown as Response;

    const error = await getErrorFromResponse(response);
    expect(error.message).toBe('error: Unknown error, statusCode: 400');
  });

  it('returns generic HTTP error when JSON parsing fails', async () => {
    const response = {
      status: 500,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
    } as unknown as Response;

    const error = await getErrorFromResponse(response);

    expect(error.message).toBe('HTTP 500 error');
  });

  it('returns generic HTTP error when text parsing fails', async () => {
    const response = {
      status: 500,
      headers: {
        get: jest.fn().mockReturnValue('text/plain'),
      },
      text: jest.fn().mockRejectedValue(new Error('Read error')),
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
