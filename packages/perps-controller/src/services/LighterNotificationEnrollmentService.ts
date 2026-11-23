import {
  NOTIFY_PERPS_API_CONFIG,
  PERPS_CONSTANTS,
} from '../constants/perpsConfig.js';
import type { PerpsPlatformDependencies } from '../types/index.js';
import type { PerpsControllerMessengerBase } from '../types/messenger.js';
import { ensureError } from '../utils/errorUtils.js';
import { getOptionalBearerToken } from './getOptionalBearerToken.js';

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * LighterNotificationEnrollmentService
 *
 * Tells notify-perps which Lighter account to watch for the signed-in profile.
 * Mirrors the order reporting done for Hyperliquid (`DataLakeService`): meant
 * to be fired without awaiting, retries with exponential backoff, never
 * throws, and only logs failures.
 */
export class LighterNotificationEnrollmentService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  /**
   * Create a new LighterNotificationEnrollmentService instance
   *
   * @param deps - Platform dependencies for logging.
   * @param messenger - Controller messenger for cross-controller communication.
   */
  constructor(
    deps: PerpsPlatformDependencies,
    messenger: PerpsControllerMessengerBase,
  ) {
    this.#deps = deps;
    this.#messenger = messenger;
  }

  /**
   * Enroll the Lighter account with notify-perps.
   *
   * The profile comes from the bearer token, so the body is only the account
   * index. The call is idempotent on the server.
   *
   * @param options - Configuration object
   * @param options.isTestnet - Whether Lighter runs on testnet (skips the call)
   * @param options.getAccountIndex - Resolves the Lighter account index. Called
   * before the first await so it reads the account that placed the order.
   * @returns Result object with success flag and optional error message
   */
  async enroll(options: {
    isTestnet: boolean;
    getAccountIndex: () => Promise<number>;
  }): Promise<{ success: boolean; error?: string }> {
    const { isTestnet, getAccountIndex } = options;

    if (isTestnet) {
      this.#deps.debugLogger.log(
        'Lighter notification enrollment: Skipping for testnet',
      );
      return { success: true, error: 'Skipped for testnet' };
    }

    const baseUrl = this.#deps.notifyPerpsApi?.baseUrl;
    if (!baseUrl) {
      this.#deps.debugLogger.log(
        'Lighter notification enrollment: No base URL configured',
      );
      return { success: false, error: 'No base URL configured' };
    }

    let attempt = 0;
    let lastError = 'Unknown error';
    try {
      const [token, accountIndex] = await Promise.all([
        getOptionalBearerToken(this.#messenger),
        getAccountIndex(),
      ]);
      if (!token) {
        this.#deps.debugLogger.log(
          'Lighter notification enrollment: No token available',
        );
        return { success: false, error: 'No token available' };
      }
      const body = JSON.stringify({ account_index: accountIndex });
      const url = `${baseUrl.replace(/\/$/u, '')}${NOTIFY_PERPS_API_CONFIG.LighterNotificationAccountsPath}`;

      for (; attempt <= NOTIFY_PERPS_API_CONFIG.MaxRetries; attempt++) {
        if (attempt > 0) {
          await delay(
            NOTIFY_PERPS_API_CONFIG.RetryDelayMs * 2 ** (attempt - 1),
          );
        }
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body,
          });
          if (!response.ok) {
            throw new Error(
              `Lighter notification enrollment API error: ${response.status}`,
            );
          }
          return { success: true };
        } catch (error) {
          lastError = ensureError(
            error,
            'LighterNotificationEnrollmentService.enroll',
          ).message;
          this.#logError(
            error,
            attempt,
            attempt < NOTIFY_PERPS_API_CONFIG.MaxRetries,
          );
        }
      }
    } catch (error) {
      lastError = ensureError(
        error,
        'LighterNotificationEnrollmentService.enroll',
      ).message;
      this.#logError(error, attempt, false);
    }
    return { success: false, error: lastError };
  }

  #logError(error: unknown, retryCount: number, willRetry: boolean): void {
    this.#deps.logger.error(
      ensureError(error, 'LighterNotificationEnrollmentService.enroll'),
      {
        tags: { feature: PERPS_CONSTANTS.FeatureName },
        context: {
          name: 'LighterNotificationEnrollmentService.enroll',
          data: { retryCount, willRetry },
        },
      },
    );
  }
}
