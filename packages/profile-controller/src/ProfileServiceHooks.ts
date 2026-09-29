import { useQuery } from '@metamask/react-data-query';
import { useEffect, useState } from 'react';

import type {
  ProfileApiResponse,
  UsernameAvailabilityResponse,
} from './ProfileService.js';
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
 * Debounces the username before querying to avoid firing a request on every keystroke.
 *
 * @param username - The username to check availability for.
 * @param debounceMs - How long to wait after the last change before querying. Defaults to 300ms.
 * @returns A TanStack Query result containing the availability details.
 */
export function useCheckUsernameAvailability(
  username: string,
  debounceMs = 300,
): ReturnType<typeof useQuery<UsernameAvailabilityResponse>> {
  const [debouncedUsername, setDebouncedUsername] = useState(username);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUsername(username), debounceMs);
    return () => clearTimeout(timer);
  }, [username, debounceMs]);

  return useQuery<UsernameAvailabilityResponse>({
    queryKey: [`${serviceName}:checkUsernameAvailability`, debouncedUsername],
  });
}
