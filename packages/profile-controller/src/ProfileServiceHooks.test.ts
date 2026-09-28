import { useQuery as useQueryFromReactDataQuery } from '@metamask/react-data-query';

import { serviceName } from './ProfileService.js';
import {
  useCheckUsernameAvailability,
  useGetProfile,
} from './ProfileServiceHooks.js';

jest.mock('@metamask/react-data-query', () => ({
  useQuery: jest.fn(),
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
  it('calls useQuery with the correct query key for the given username', () => {
    useCheckUsernameAvailability('alice');

    expect(useQueryFromReactDataQuery).toHaveBeenCalledWith({
      queryKey: [`${serviceName}:checkUsernameAvailability`, 'alice'],
    });
  });
});
