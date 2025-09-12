import type {
  AccountsControllerGetSelectedMultichainAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  KeyringControllerSignPersonalMessageAction,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';

import type { controllerName } from '../constants';
import type {
  RewardsDataServiceLoginAction,
  RewardsDataServiceEstimatePointsAction,
  RewardsDataServiceGetPerpsDiscountAction,
  RewardsDataServiceGetSeasonStatusAction,
  RewardsDataServiceGetReferralDetailsAction,
  RewardsDataServiceGenerateChallengeAction,
  RewardsDataServiceOptinAction,
  RewardsDataServiceLogoutAction,
  RewardsDataServiceFetchGeoLocationAction,
  RewardsDataServiceValidateReferralCodeAction,
  RewardsDataServiceGetPointsEventsAction,
} from '../services';
import type {
  RewardsControllerActions,
  RewardsControllerEvents,
} from '../types';

// Don't reexport as per guidelines
type AllowedActions =
  | AccountsControllerGetSelectedMultichainAccountAction
  | KeyringControllerSignPersonalMessageAction
  | RewardsDataServiceLoginAction
  | RewardsDataServiceGetPointsEventsAction
  | RewardsDataServiceEstimatePointsAction
  | RewardsDataServiceGetPerpsDiscountAction
  | RewardsDataServiceGetSeasonStatusAction
  | RewardsDataServiceGetReferralDetailsAction
  | RewardsDataServiceGenerateChallengeAction
  | RewardsDataServiceOptinAction
  | RewardsDataServiceLogoutAction
  | RewardsDataServiceFetchGeoLocationAction
  | RewardsDataServiceValidateReferralCodeAction
  | RemoteFeatureFlagControllerGetStateAction;

// Don't reexport as per guidelines
type AllowedEvents =
  | AccountsControllerSelectedAccountChangeEvent
  | KeyringControllerUnlockEvent;

export type RewardsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  RewardsControllerActions | AllowedActions,
  RewardsControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
