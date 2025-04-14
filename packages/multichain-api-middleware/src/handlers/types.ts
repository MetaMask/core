import type {
  CaveatSpecificationConstraint,
  PermissionController,
  PermissionSpecificationConstraint,
} from '@metamask/permission-controller';
import type { Json } from '@metamask/utils';

/**
 * Multichain API notifications currently supported by/known to the wallet.
 */
export enum MultichainApiNotifications {
  sessionChanged = 'wallet_sessionChanged',
  walletNotify = 'wallet_notify',
}
type AbstractPermissionController = PermissionController<
  PermissionSpecificationConstraint,
  CaveatSpecificationConstraint
>;

/**
 * Used to attach context of where the user was at in the application when the
 * event was triggered. Also included as full details of the current page in
 * page events.
 */
type MetaMetricsPageObject = {
  /**
   * The path of the current page (e.g. "/home").
   */
  path?: string;
  /**
   * The title of the current page (e.g. "home").
   */
  title?: string;
  /**
   * The fully qualified URL of the current page.
   */
  url?: string;
};

/**
 * The dapp that triggered an interaction (MetaMask only).
 */
export type MetaMetricsReferrerObject = {
  /**
   * The origin of the dapp issuing the notification.
   */
  url?: string;
};

export type GrantedPermissions = Awaited<
  ReturnType<AbstractPermissionController['requestPermissions']>
>[0];

export type MetaMetricsEventOptions = {
  /**
   * Whether or not the event happened during the opt-in workflow.
   */
  isOptIn?: boolean;
  /**
   * Whether the segment queue should be flushed after tracking the event.
   * Recommended if the result of tracking the event must be known before UI
   * transition or update.
   */
  flushImmediately?: boolean;
  /**
   * Whether to exclude the user's `metaMetricsId` for anonymity.
   */
  excludeMetaMetricsId?: boolean;
  /**
   * An override for the `metaMetricsId` in the event (no pun intended) one is
   * created as a part of an asynchronous workflow, such as awaiting the result
   * of the MetaMetrics opt-in function that generates the user's
   * `metaMetricsId`.
   */
  metaMetricsId?: string;
  /**
   * Is this event a holdover from Matomo that needs further migration? When
   * true, sends the data to a special Segment source that marks the event data
   * as not conforming to our schema.
   */
  matomoEvent?: boolean;
  /**
   * Values that can used in the "properties" tracking object as keys,
   */
  contextPropsIntoEventProperties?: string | string[];
};

export type MetaMetricsEventPayload = {
  /**
   * The event name to track.
   */
  event: string;
  /**
   * The category to associate the event to.
   */
  category: string;
  /**
   * The action ID to deduplicate event requests from the UI.
   */
  actionId?: string;
  /**
   * The type of environment this event occurred in. Defaults to the background
   * process type.
   */
  environmentType?: string;
  /**
   * Custom values to track. Keys in this object must be `snake_case`.
   */
  properties?: Record<string, Json>;

  /**
   * Sensitive values to track. These properties will be sent in an additional
   * event that excludes the user's `metaMetricsId`. Keys in this object must be
   * in `snake_case`.
   */
  sensitiveProperties?: Record<string, Json>;
  /**
   * Amount of currency that the event creates in revenue for MetaMask.
   */
  revenue?: number;
  /**
   * ISO-4127-formatted currency for events with revenue. Defaults to US
   * dollars.
   */
  currency?: string;
  /**
   * Abstract business "value" attributable to customers who trigger this event.
   */
  value?: number;
  /**
   * The page/route that the event occurred on.
   */
  page?: MetaMetricsPageObject;
  /**
   * The origin of the dapp that triggered this event.
   */
  referrer?: MetaMetricsReferrerObject;
  /*
   * The unique identifier for the event.
   */
  uniqueIdentifier?: string;
  /**
   * Whether the event is a duplicate of an anonymized event.
   */
  isDuplicateAnonymizedEvent?: boolean;
};
