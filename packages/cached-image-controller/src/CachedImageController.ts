import { BaseControllerV2 } from '@metamask/base-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import type { Patch } from 'immer';

const controllerName = 'CachedImageController';

const stateMetadata = {
  imageCache: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  imageCache: {},
});

type ImageUrl = string;

export const CachedImageControllerActionTypes = {
  getState: `${controllerName}:getState` as const,
  fetch: `${controllerName}:fetch` as const,
};

export const CachedImageControllerEventTypes = {
  stateChange: `${controllerName}:stateChange` as const,
};

export type CachedImageControllerState = {
  imageCache: Record<ImageUrl, string>;
};

export type CachedImageControllerStateChangeEvent = {
  type: typeof CachedImageControllerEventTypes.stateChange;
  payload: [CachedImageControllerState, Patch[]];
};

export type CachedImageControllerGetCachedImageStateAction = {
  type: typeof CachedImageControllerActionTypes.getState;
  handler: () => CachedImageControllerState;
};

export type CachedImageControllerFetchAndCacheImageAction = {
  type: typeof CachedImageControllerActionTypes.fetch;
  handler: (imageUrl: ImageUrl) => void;
};

export type CachedImageControllerAction =
  | CachedImageControllerGetCachedImageStateAction
  | CachedImageControllerFetchAndCacheImageAction;

export type CachedImageControllerEvent =
  CachedImageControllerStateChangeEvent;

export type CachedImageControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  CachedImageControllerAction,
  CachedImageControllerEvent,
  string,
  string
>;

export type CachedImageControllerOptions = {
  messenger: CachedImageControllerMessenger;
};

/**
 * Controller for caching and retrieving images from URLs.
 */
export class CachedImageController extends BaseControllerV2<
  typeof controllerName,
  CachedImageControllerState,
  CachedImageControllerMessenger
> {
  /**
   * Construct a CachedImageController.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the CachedImageController.
   */
  constructor({ messenger }: CachedImageControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
    });
    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      CachedImageControllerActionTypes.fetch,
      this.fetch.bind(this),
    );
  }

  async fetch(imageUrl: ImageUrl): Promise<string | null> {
    // Check if the image is already cached
    if (this.state.imageCache[imageUrl]) {
      return this.state.imageCache[imageUrl];
    }

    // If not cached, fetch and cache it
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const base64Data = await this.blobToBase64(blob);

      if (base64Data) {
        // Update the cache with the fetched image
        this.update((draft) => {
          draft.imageCache[imageUrl] = base64Data;
        });

        return base64Data;
      }
    } catch (error) {
      console.error('Error fetching and caching image:', error);
    }

    return null; // Return null if fetching or caching fails
  }


  /**
   * Helper function to convert a Blob to base64.
   *
   * @param blob - The Blob to convert.
   * @returns Promise<string | null> - Base64 encoded data or null on error.
   */
  private async blobToBase64(blob: Blob): Promise<string | null> {
    try {
      const reader = new FileReader();
      return new Promise<string | null>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result?.toString() || null);
        reader.onerror = () => reject(null);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting Blob to base64:', error);
      return null;
    }
  }

}
