import type { CaipAccountAddress } from '@metamask/utils';

const controllerName = 'ProfileController';

type NetworkName = 'ethereum' | 'stellar' | 'solana' | 'bitcoin' | 'tron';

export type MetaMaskProfile = {
  profileId: string;
  username: string;
  displayName: string;
  bio?: string;
  linkedAddresses: Record<NetworkName, CaipAccountAddress>;
  avatarUrl: string;
  tradingPrivacy: 'public' | 'private';
  connectedToX: boolean;
  createdAt: string;
  updatedAt: string;
};

export type XProfile = {
  userId: string;
  profileId: string;
  handle: string;
  displayName: string;
  profilePictureUrl: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProfileControllerState = {
  metamaskProfile: MetaMaskProfile;
  xProfile?: XProfile;
};

export type ProfileControllerGetStateAction = ControllerGetState;
