import {
  composeSubscriptionApiErrorMessage,
  createSentryError,
  getSubscriptionErrorFromResponse,
  SubscriptionServiceError,
} from './errors';

type MockResponseOptions = {
  status?: number;
  contentType?: string | null;
  jsonData?: unknown;
  textData?: string;
  jsonThrows?: boolean;
  data?: string;
  jsonThrowsWithString?: boolean;
};

function createMockResponse({
  status = 500,
  contentType = 'application/json',
  jsonData = {},
  textData = 'plain error',
  jsonThrows = false,
  jsonThrowsWithString = false,
  data,
}: MockResponseOptions): Response {
  let json = jest.fn().mockResolvedValue(jsonData);
  if (jsonThrows) {
    json = jest.fn().mockRejectedValue(new Error('bad json'));
  } else if (jsonThrowsWithString) {
    json = jest.fn().mockRejectedValue('string error');
  }
  return {
    status,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'content-type' ? contentType : null,
    },
    json,
    text: jest.fn().mockResolvedValue(textData),
    data,
  } as unknown as Response;
}

describe('errors', () => {
  describe('SubscriptionServiceError', () => {
    it('sets name and cause', () => {
      const cause = new Error('root cause');
      const error = new SubscriptionServiceError('message', { cause });

      expect(error.name).toBe('SubscriptionServiceError');
      expect(error.message).toBe('message');
      expect(error.cause).toBe(cause);
    });

    it('sets name and message without cause', () => {
      const error = new SubscriptionServiceError('message');

      expect(error.name).toBe('SubscriptionServiceError');
      expect(error.message).toBe('message');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('createSentryError', () => {
    it('wraps the cause on the error', () => {
      const cause = new Error('inner');
      const error = createSentryError('outer', cause);

      expect(error.message).toBe('outer');
      expect((error as Error & { cause: Error }).cause).toBe(cause);
    });
  });

  describe('getErrorFromResponse', () => {
    it('uses JSON message when content-type is json', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 400,
        jsonData: { message: 'Bad request' },
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: Bad request');
      expect(error.message).toContain('statusCode: 400');
    });

    it('includes errorCode in message when present in JSON response', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 400,
        jsonData: { message: 'Invalid input', errorCode: 'E400' },
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: Invalid input');
      expect(error.message).toContain('statusCode: 400');
      expect(error.message).toContain('errorCode: E400');
    });

    it('uses JSON message field for error message', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 422,
        jsonData: { message: 'Unprocessable' },
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: Unprocessable');
      expect(error.message).toContain('statusCode: 422');
    });

    it('uses Unknown error when JSON has no message', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 418,
        jsonData: { detail: 'teapot' },
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: Unknown error');
      expect(error.message).toContain('statusCode: 418');
    });

    it('uses text body when content-type is text/plain', async () => {
      const response = createMockResponse({
        contentType: 'text/plain',
        status: 503,
        textData: 'Service unavailable',
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: Service unavailable');
      expect(error.message).toContain('statusCode: 503');
    });

    it('uses response data when content-type is missing', async () => {
      const response = createMockResponse({
        contentType: null,
        status: 500,
        data: 'fallback data',
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: fallback data');
      expect(error.message).toContain('statusCode: 500');
    });

    it('uses Unknown error when response data is not a string', async () => {
      const response = createMockResponse({
        contentType: null,
        status: 500,
        data: { code: 'UNKNOWN' } as unknown as string,
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toContain('error: Unknown error');
      expect(error.message).toContain('statusCode: 500');
    });

    it('returns generic HTTP error when parsing fails', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 502,
        jsonThrows: true,
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toBe('HTTP 502 error: bad json');
    });

    it('returns generic HTTP error when parsing fails for string error', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 502,
        jsonThrowsWithString: true,
      });

      const error = await getSubscriptionErrorFromResponse(response);

      expect(error.message).toBe('HTTP 502 error: Unknown error');
    });
  });

  describe('composeSubscriptionApiErrorMessage', () => {
    it('composes message with message and statusCode', () => {
      const result = composeSubscriptionApiErrorMessage(
        { message: 'Not found' },
        404,
      );

      expect(result).toBe('error: Not found, statusCode: 404');
    });

    it('appends errorCode when present', () => {
      const result = composeSubscriptionApiErrorMessage(
        { message: 'Invalid', errorCode: 'INVALID_INPUT' },
        400,
      );

      expect(result).toBe(
        'error: Invalid, statusCode: 400, errorCode: INVALID_INPUT',
      );
    });

    it('uses Unknown error when message is undefined', () => {
      const result = composeSubscriptionApiErrorMessage({}, 500);

      expect(result).toBe('error: Unknown error, statusCode: 500');
    });

    it('uses Unknown status code when statusCode is undefined', () => {
      const result = composeSubscriptionApiErrorMessage(
        { message: 'Error' },
        undefined as unknown as number,
      );

      expect(result).toBe('error: Error, statusCode: Unknown status code');
    });

    it('handles both message and statusCode being undefined', () => {
      const result = composeSubscriptionApiErrorMessage(
        {},
        undefined as unknown as number,
      );

      expect(result).toBe(
        'error: Unknown error, statusCode: Unknown status code',
      );
    });
  });
});
