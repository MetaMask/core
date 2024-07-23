/**
 * Formats a hostname into a URL so we can parse it correctly
 * and pass full URLs into the PhishingDetector class. Previously
 * only hostnames were supported, but now only full URLs are
 * supported since we want to block IPFS CIDs.
 *
 * @param hostname - the hostname of the URL.
 * @returns the href property of a URL object.
 */
export const formatHostnameToUrl = (hostname: string): string => {
  let url = '';
  try {
    url = new URL(hostname).href;
  } catch (e) {
    url = new URL(['https://', hostname].join('')).href;
  }
  return url;
};
