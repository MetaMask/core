import { useQuery as useQueryFromReactDataQuery } from '@metamask/react-data-query';

import { serviceName } from './ProfileService.js';
import {
  useCheckUsernameAvailability,
  useGetProfile,
} from './ProfileServiceHooks.js';

jest.mock('@metamask/react-data-query', () => ({
  useQuery: jest.fn(),
}));

const mockSetState = jest.fn();
const mockUseEffect = jest.fn();

jest.mock('react', () => ({
  useState: <TValue>(initial: TValue): [TValue, jest.Mock] => [
    initial,
    mockSetState,
  ],
  useEffect: (...args: unknown[]): void => mockUseEffect(...args),
}));

describe('useGetProfile', () => {
  it('calls useQuery with the correct query key for the given identifier', () => {
    useGetProfile('profile-123');

    expect(useQueryFromReactDataQuery).toHaveBeenCalledWith({
      queryKey: [`${serviceName}:getProfile`, 'profile-123'],
    });
  });
});

describe('useCheckUsernameAvailability', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseEffect.mockImplementation((fn: () => (() => void) | void) => fn());
  });

  afterEach(() => {
    jest.useRealTimers();
    mockSetState.mockClear();
  });

  it('calls useQuery with the initial username immediately', () => {
    useCheckUsernameAvailability('alice');

    expect(useQueryFromReactDataQuery).toHaveBeenCalledWith({
      queryKey: [`${serviceName}:checkUsernameAvailability`, 'alice'],
    });
  });

  it('calls setState with the updated username after debounce delay', () => {
    useCheckUsernameAvailability('alice', 500);

    jest.advanceTimersByTime(500);

    expect(mockSetState).toHaveBeenCalledWith('alice');
  });

  it('cleanup cancels pending state update', () => {
    let capturedCleanup: (() => void) | void;
    mockUseEffect.mockImplementationOnce((fn: () => (() => void) | void) => {
      capturedCleanup = fn();
    });

    useCheckUsernameAvailability('alice', 500);
    capturedCleanup?.();
    jest.advanceTimersByTime(500);

    expect(mockSetState).not.toHaveBeenCalledWith('alice');
  });
});
