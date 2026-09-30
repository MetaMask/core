import {
  useQuery as useQueryFromTanStack,
  useInfiniteQuery as useInfiniteQueryFromTanStack,
  useMutation as useMutationFromTanStack,
} from '@tanstack/react-query';

import { useInfiniteQuery, useMutation, useQuery } from './hooks.js';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useInfiniteQuery: jest.fn(),
  useMutation: jest.fn(),
}));

describe('useQuery', () => {
  it('calls useQuery from TanStack Query, enforcing that queries are always fresh and disabling retries by default', () => {
    const options = {
      queryKey: ['foo'] as const,
    };
    expect(() => useQuery(options)).not.toThrow();
    expect(useQueryFromTanStack).toHaveBeenCalledWith({
      staleTime: 0,
      retry: false,
      ...options,
    });
  });
});

describe('useInfiniteQuery', () => {
  it('calls useInfiniteQuery from TanStack Query, enforcing that queries are always fresh and disabling retries by default', () => {
    const options = {
      queryKey: ['foo'] as const,
      initialPageParam: undefined,
      getNextPageParam: (): undefined => undefined,
    };
    expect(() => useInfiniteQuery(options)).not.toThrow();
    expect(useInfiniteQueryFromTanStack).toHaveBeenCalledWith({
      staleTime: 0,
      retry: false,
      ...options,
    });
  });
});

describe('useMutation', () => {
  it('calls useMutation from TanStack Query, disabling retries by default', () => {
    const options = {
      mutationKey: ['foo'] as const,
    };
    expect(() => useMutation(options)).not.toThrow();
    expect(useMutationFromTanStack).toHaveBeenCalledWith({
      retry: false,
      ...options,
    });
  });
});
