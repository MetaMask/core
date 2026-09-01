import type {
  StateMetadata,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import {
  AiDigestControllerErrorMessage,
  controllerName,
} from './ai-digest-constants.js';
import type {
  AiDigestControllerState,
  DigestService,
  MarketInsightsReport,
  MarketOverview,
  MarketOverviewFrontPage,
} from './ai-digest-types.js';
import type { AiDigestControllerMethodActions } from './AiDigestController-method-action-types.js';

export type AiDigestControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerActions =
  | AiDigestControllerGetStateAction
  | AiDigestControllerMethodActions;

export type AiDigestControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerEvents = AiDigestControllerStateChangeEvent;

export type AiDigestControllerMessenger = Messenger<
  typeof controllerName,
  AiDigestControllerActions,
  AiDigestControllerEvents
>;

export type AiDigestControllerOptions = {
  messenger: AiDigestControllerMessenger;
  digestService: DigestService;
};

export function getDefaultAiDigestControllerState(): AiDigestControllerState {
  return {};
}

const aiDigestControllerMetadata: StateMetadata<AiDigestControllerState> = {};

const MESSENGER_EXPOSED_METHODS = [
  'fetchMarketInsights',
  'fetchMarketOverview',
  'fetchFrontPageItem',
] as const;

export class AiDigestController extends BaseController<
  typeof controllerName,
  AiDigestControllerState,
  AiDigestControllerMessenger
> {
  readonly #digestService: DigestService;

  constructor({ messenger, digestService }: AiDigestControllerOptions) {
    super({
      name: controllerName,
      metadata: aiDigestControllerMetadata,
      state: getDefaultAiDigestControllerState(),
      messenger,
    });

    this.#digestService = digestService;
    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches market insights for a given asset identifier.
   *
   * Accepts either a CAIP-19 asset type (e.g. `eip155:1/slip44:60`) or a perps
   * market symbol (e.g. `ETH`). The service handles choosing the correct API
   * query parameter automatically. Clients own freshness/caching.
   *
   * @param assetIdentifier - The asset identifier (CAIP-19 ID or perps market symbol).
   * @returns The market insights report, or `null` if none exists.
   */
  async fetchMarketInsights(
    assetIdentifier: string,
  ): Promise<MarketInsightsReport | null> {
    if (!assetIdentifier) {
      throw new Error(AiDigestControllerErrorMessage.INVALID_ASSET_IDENTIFIER);
    }

    return this.#digestService.searchDigest(assetIdentifier);
  }

  /**
   * Fetches the market overview report.
   *
   * Clients own freshness/caching.
   *
   * @returns The market overview report, or `null` if none exists.
   */
  async fetchMarketOverview(): Promise<MarketOverview | null> {
    return this.#digestService.fetchMarketOverview();
  }

  /**
   * Fetches a single market overview front page by id.
   *
   * Unlike the market overview report (which only returns the latest items),
   * this resolves an older item that has since dropped out of the report, so
   * clients can render it directly (e.g. from a deep link).
   *
   * @param id - The front-page identifier (UUID).
   * @returns The market overview front page, or `null` if none exists.
   */
  async fetchFrontPageItem(
    id: string,
  ): Promise<MarketOverviewFrontPage | null> {
    if (!id) {
      throw new Error(AiDigestControllerErrorMessage.INVALID_FRONT_PAGE_ID);
    }

    return this.#digestService.fetchFrontPageItem(id);
  }
}
