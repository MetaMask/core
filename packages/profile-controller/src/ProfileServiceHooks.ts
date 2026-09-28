import { useQuery } from '@metamask/react-data-query';

import type { ProfileApiResponse, UsernameAvailabilityResponse } from './ProfileService.js';
import { serviceName } from './ProfileService.js';

export function useGetProfile(
  identifier: string,
): ReturnType<typeof useQuery<ProfileApiResponse>> {
  return useQuery<ProfileApiResponse>({
    queryKey: [`${serviceName}:getProfile`, identifier],
  });
}

export function useCheckUsernameAvailability(
  username: string,
): ReturnType<typeof useQuery<UsernameAvailabilityResponse>> {
  return useQuery<UsernameAvailabilityResponse>({
    queryKey: [`${serviceName}:checkUsernameAvailability`, username],
  });
}
