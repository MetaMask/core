import { useQuery } from '@metamask/react-data-query';

import type { ProfileApiResponse, UsernameAvailabilityResponse } from './ProfileService.js';
import { serviceName } from './ProfileService.js';

/**
 * React hook that reads a profile by identifier from the ProfileService query cache.
 *
 * @param identifier - The profile identifier to fetch.
 * @returns A TanStack Query result containing the profile data.
 */
export function useGetProfile(
  identifier: string,
): ReturnType<typeof useQuery<ProfileApiResponse>> {
  return useQuery<ProfileApiResponse>({
    queryKey: [`${serviceName}:getProfile`, identifier],
  });
}

/**
 * React hook that reads username availability from the ProfileService query cache.
 *
 * @param username - The username to check availability for.
 * @returns A TanStack Query result containing the availability details.
 */
export function useCheckUsernameAvailability(
  username: string,
): ReturnType<typeof useQuery<UsernameAvailabilityResponse>> {
  return useQuery<UsernameAvailabilityResponse>({
    queryKey: [`${serviceName}:checkUsernameAvailability`, username],
  });
}
