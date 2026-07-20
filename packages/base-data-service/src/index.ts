export type {
  Event as CockatielEvent,
  FailureReason as CockatielFailureReason,
} from 'cockatiel';

export {
  BrokenCircuitError,
  EventEmitter as CockatielEventEmitter,
  CircuitState,
  ConstantBackoff,
  ExponentialBackoff,
  handleAll,
  handleWhen,
} from 'cockatiel';

export type {
  DataServiceCacheUpdatedPayload,
  DataServiceGranularCacheUpdatedPayload,
  DataServiceInvalidateQueriesAction,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  QueryKey,
  PersistenceConfiguration,
} from './BaseDataService';
export { BaseDataService } from './BaseDataService';

export {
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
  createServicePolicy,
} from './createServicePolicy';
export type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from './createServicePolicy';
