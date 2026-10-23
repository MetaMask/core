/**
 * Shared test utilities for API client tests.
 */

import { QueryClient } from '@tanstack/query-core';
import { vi } from 'vitest';
import type { Mock } from 'vitest';

import { ApiPlatformClient } from '../src/api/ApiPlatformClient.js';

// Mock fetch globally
export const mockFetch: Mock = vi.fn();
(globalThis as typeof globalThis & { fetch: Mock }).fetch = mockFetch;

/**
 * Helper to create a mock Response.
 *
 * @param data - The response data to return from json().
 * @param status - HTTP status code.
 * @param statusText - HTTP status text.
 * @returns A mocked Response object.
 */
export const createMockResponse = <ResponseData>(
  data: ResponseData,
  status = 200,
  statusText = 'OK',
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data),
    headers: { get: vi.fn() },
    redirected: false,
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
  }) as unknown as Response;

/**
 * Creates a fresh ApiPlatformClient for testing with disabled caching/retry.
 *
 * @returns A new ApiPlatformClient instance configured for testing.
 */
export function createTestClient(): ApiPlatformClient {
  return new ApiPlatformClient({
    clientProduct: 'test-client',
    clientVersion: '1.0.0',
    queryClient: new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0,
        },
      },
    }),
  });
}

/**
 * Setup function to be called in beforeEach.
 *
 * @returns An object containing a fresh test client.
 */
export function setupTestEnvironment(): { client: ApiPlatformClient } {
  vi.clearAllMocks();
  mockFetch.mockReset();
  return { client: createTestClient() };
}
