import {
  useQuery as useQueryTanStack,
  useInfiniteQuery as useInfiniteQueryTanStack,
} from '@tanstack/react-query';

import { useInfiniteQuery, useQuery } from './hooks.js';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useInfiniteQuery: jest.fn(),
}));

describe('useQuery', () => {
  it('calls the underlying TanStack query function', () => {
    const options = {
      // Type assertion: `useQuery` wants `[string, ...Json[]]`,
      // which is not the inferred type of this key.
      queryKey: ['foo'] as ['foo'],
    };
    expect(() => useQuery(options)).not.toThrow();
    expect(useQueryTanStack).toHaveBeenCalledWith({
      staleTime: 0,
      retry: false,
      ...options,
    });
  });
});

describe('useInfiniteQuery', () => {
  it('calls the underlying TanStack query function', () => {
    const options = {
      // Type assertion: `useQuery` wants `[string, ...Json[]]`,
      // which is not the inferred type of this key.
      queryKey: ['foo'] as ['foo'],
      initialPageParam: undefined,
      getNextPageParam: (): undefined => undefined,
    };
    expect(() => useInfiniteQuery(options)).not.toThrow();
    expect(useInfiniteQueryTanStack).toHaveBeenCalledWith({
      staleTime: 0,
      retry: false,
      ...options,
    });
  });
});
