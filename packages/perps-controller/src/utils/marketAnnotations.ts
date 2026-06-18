/**
 * HyperLiquid perp-annotation resolution (TAT-3338).
 *
 * HyperLiquid exposes optional, deployer-set annotations for perpetual assets via
 * the `perpConciseAnnotations` info endpoint (one bulk call returning a
 * `[coin, { category, displayName?, keywords? }]` tuple per asset). These provide
 * a `displayName` (a frontend-friendly name to use instead of the raw L1 ticker)
 * and `keywords` (search hints).
 *
 * Annotations are optional and deployer-controlled, so they do not replace the
 * curated, first-party {@link HYPERLIQUID_ASSET_NAMES} map — they layer beneath
 * it. Name resolution precedence is:
 *
 *   curated map  >  annotation `displayName`  >  raw ticker symbol
 *
 * The raw-symbol fallback is applied downstream by
 * {@link getHyperLiquidAssetName} (which returns the symbol for any key absent
 * from the supplied name map), so these helpers only need to merge the curated
 * map over the annotation display names.
 *
 * Portable: no platform- or SDK-specific imports. The input type mirrors the
 * `@nktkas/hyperliquid` `PerpConciseAnnotationsResponse` shape so the provider
 * can pass the SDK response through directly, while keeping this module
 * dependency-free and unit-testable.
 */
import { HYPERLIQUID_ASSET_NAMES } from '../constants/hyperLiquidConfig';

/**
 * A single concise annotation for a perpetual asset, mirroring the
 * `@nktkas/hyperliquid` `perpConciseAnnotations` entry value.
 */
export type PerpConciseAnnotation = {
  /** Classification category assigned to the perpetual. */
  category: string;
  /** Display name for frontends to use instead of the L1 name (optional). */
  displayName?: string;
  /** Keywords used as hints to match against searches (optional). */
  keywords?: string[];
};

/**
 * A `[coin, annotation]` tuple as returned by `perpConciseAnnotations`.
 */
export type PerpConciseAnnotationEntry = [
  coin: string,
  annotation: PerpConciseAnnotation,
];

/**
 * Build a `symbol → human-readable name` map from concise annotations, with the
 * curated map taking precedence.
 *
 * Annotation display names fill in only where the curated map has no entry, so
 * first-party curated names always win. Symbols present in neither map are
 * omitted, leaving the downstream {@link getHyperLiquidAssetName} symbol fallback
 * to apply. The result is suitable to pass as the `assetNames` argument of
 * `transformMarketData`.
 *
 * @param annotations - Concise annotations (e.g. the `perpConciseAnnotations`
 * response). When undefined/empty, the curated map is returned unchanged.
 * @param curatedNames - Curated first-party names that override annotations
 * (defaults to the bundled {@link HYPERLIQUID_ASSET_NAMES}).
 * @returns A merged name map where curated entries override annotation display
 * names.
 */
export function mergeAssetNamesWithAnnotations(
  annotations: PerpConciseAnnotationEntry[] | undefined,
  curatedNames: Record<string, string> = HYPERLIQUID_ASSET_NAMES,
): Record<string, string> {
  if (!annotations?.length) {
    return { ...curatedNames };
  }

  const merged: Record<string, string> = {};
  for (const [coin, annotation] of annotations) {
    const displayName = annotation?.displayName?.trim();
    if (displayName) {
      merged[coin] = displayName;
    }
  }

  // Curated names override annotation display names (first-party wins).
  return { ...merged, ...curatedNames };
}

/**
 * Build a `symbol → keywords` map from concise annotations.
 *
 * Only assets with at least one non-empty keyword are included. The result is
 * suitable to pass as the `assetKeywords` argument of `transformMarketData`,
 * which surfaces them on `PerpsMarketData.keywords` for ranked search.
 *
 * @param annotations - Concise annotations (e.g. the `perpConciseAnnotations`
 * response).
 * @returns A map of asset symbol to its trimmed, non-empty keywords.
 */
export function extractAssetKeywords(
  annotations: PerpConciseAnnotationEntry[] | undefined,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!annotations?.length) {
    return result;
  }

  for (const [coin, annotation] of annotations) {
    const keywords = annotation?.keywords
      ?.map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
    if (keywords?.length) {
      result[coin] = keywords;
    }
  }

  return result;
}
