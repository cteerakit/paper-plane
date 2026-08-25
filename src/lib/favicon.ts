/** MV3 Favicon API URL for a page (requires `favicon` permission). */
export function getExtensionFaviconUrl(pageUrl: string, size = 32): string | undefined {
  try {
    const extensionId = browser?.runtime?.id;
    if (!extensionId || !pageUrl) return undefined;
    const url = new URL(`chrome-extension://${extensionId}/_favicon/`);
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(size));
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Google S2 favicon fallback when the extension Favicon API is unavailable. */
export function getGoogleFaviconUrl(pageUrl: string, size = 32): string | undefined {
  try {
    const host = new URL(pageUrl).hostname;
    if (!host) return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a favicon src for a page URL.
 * Prefers an explicit tab favicon, then MV3 `_favicon`, then Google S2.
 */
export function resolveFaviconSrc(
  pageUrl: string | undefined,
  preferred?: string,
): string | undefined {
  if (preferred && preferred.trim()) return preferred;
  if (!pageUrl) return undefined;
  if (!/^https?:/i.test(pageUrl)) return undefined;
  return getExtensionFaviconUrl(pageUrl, 32) ?? getGoogleFaviconUrl(pageUrl, 32);
}
