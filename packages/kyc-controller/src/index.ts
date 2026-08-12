export type { BuildOwnershipMessageRequest } from './ownership-message.js';
export { buildOwnershipMessage } from './ownership-message.js';
export type {
  Blockchain,
  GetRegistrationStatusRequest,
  RegisterSelfHostedWalletRequest,
  RegistrationOutcome,
  RegistrationStatus,
  SelfHostedRegistration,
  WalletRegistrationErrorKind,
  WalletRegistrationServiceOptions,
} from './wallet-registration-service.js';
export {
  WalletRegistrationError,
  WalletRegistrationService,
} from './wallet-registration-service.js';
export type {
  WalletRegistrationContext,
  WalletRegistrationEvent,
  WalletRegistrationState,
  WalletRegistrationStatus,
} from './wallet-registration-machine.js';
export {
  createInitialState,
  transition,
} from './wallet-registration-machine.js';
