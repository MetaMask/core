import {
  useQuery as useQueryTanStack,
  useInfiniteQuery as useInfiniteQueryTanStack,
} from '@tanstack/react-query';

import { useInfiniteQuery, useQuery } from './hooks';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useInfiniteQuery: jest.fn(),
}));

describe('useQuery', () => {
  it('calls the underlying TanStack query function', () => {
    const options = { queryKey: ['foo'] };
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
    const options = { queryKey: ['foo'] };
    expect(() => useInfiniteQuery(options)).not.toThrow();
    expect(useInfiniteQueryTanStack).toHaveBeenCalledWith({
      staleTime: 0,
      retry: false,
      ...options,
    });
  });
});
