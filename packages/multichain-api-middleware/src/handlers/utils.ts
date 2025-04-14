/**
 * Determines whether to emit a MetaMetrics event for a given metaMetricsId.
 * Relies on the last 4 characters of the metametricsId. Assumes the IDs are evenly distributed.
 * If metaMetricsIds are distributed evenly, this should be a 1% sample rate
 *
 * @param metaMetricsId - The metametricsId to use for the event.
 * @returns Whether to emit the event or not.
 */
export function shouldEmitDappViewedEvent(
  metaMetricsId: string | null,
): boolean {
  if (metaMetricsId === null) {
    return false;
  }

  const lastFourCharacters = metaMetricsId.slice(-4);
  const lastFourCharactersAsNumber = parseInt(lastFourCharacters, 16);

  return lastFourCharactersAsNumber % 100 === 0;
}
