import { activateTab } from '@/lib/chrome-tabs';

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  /** Parent folder title when the bookmark sits under a nested folder (unused for v1 flat list). */
  folderTitle?: string;
}

/** Dedicated bookmarks folder for the Tabs Bookmarks section. */
export const FLYOUT_BOOKMARKS_FOLDER_TITLE = 'Paper Plane';

type BookmarkNode = {
  id: string;
  title?: string;
  url?: string;
  children?: BookmarkNode[];
};

/** True when the bookmarks API is present (permission granted + extension reloaded). */
export function isBookmarksApiAvailable(): boolean {
  try {
    return typeof browser !== 'undefined' && typeof browser.bookmarks?.getTree === 'function';
  } catch {
    return false;
  }
}

function isBookmarksBar(node: { id?: string; title?: string }): boolean {
  if (node.id === '1') return true;
  return /bookmarks?\s*bar/i.test(node.title ?? '');
}

/** Chrome / Chromium “Other bookmarks” (id `"2"`); Firefox may use a localized title. */
function isOtherBookmarks(node: { id?: string; title?: string }): boolean {
  if (node.id === '2') return true;
  return /other\s*bookmarks/i.test(node.title ?? '');
}

function isFolder(node: BookmarkNode): boolean {
  return !node.url;
}

/**
 * Prefer Other bookmarks so the Paper Plane folder does not appear on the bookmarks bar.
 * Fallback: first non-bar folder under root, then first root child folder.
 */
function resolveFlyoutParent(root: BookmarkNode): BookmarkNode {
  const children = root.children ?? [];
  const other = children.find((n) => isFolder(n) && isOtherBookmarks(n));
  if (other) return other;

  const nonBar = children.find((n) => isFolder(n) && !isBookmarksBar(n));
  if (nonBar) return nonBar;

  const firstFolder = children.find(isFolder);
  return firstFolder ?? root;
}

function findDirectChildFolder(parent: BookmarkNode, title: string): BookmarkNode | undefined {
  return parent.children?.find((n) => isFolder(n) && n.title === title);
}

/**
 * Look up or create the exact-titled **Paper Plane** folder under Other bookmarks
 * (or the fallback parent from {@link resolveFlyoutParent}).
 */
export async function ensureFlyoutBookmarksFolder(): Promise<BookmarkNode> {
  if (!isBookmarksApiAvailable()) {
    throw new Error(
      'Bookmarks permission is unavailable. Reload the extension after granting bookmarks access.',
    );
  }

  const tree = await browser.bookmarks.getTree();
  const root = tree?.[0] as BookmarkNode | undefined;
  if (!root) {
    throw new Error('Bookmarks tree is empty.');
  }

  const parent = resolveFlyoutParent(root);
  const existing = findDirectChildFolder(parent, FLYOUT_BOOKMARKS_FOLDER_TITLE);
  if (existing) {
    // Refresh children in case the tree snapshot is enough; getChildren for accuracy after create races.
    if (existing.children) return existing;
    const children = (await browser.bookmarks.getChildren(existing.id)) as BookmarkNode[];
    return { ...existing, children };
  }

  const created = await browser.bookmarks.create({
    parentId: parent.id,
    title: FLYOUT_BOOKMARKS_FOLDER_TITLE,
  });
  return { id: created.id, title: created.title, children: [] };
}

/** Flat list of URL bookmarks that are direct children of the Paper Plane folder. */
export async function listFlyoutBookmarks(): Promise<BookmarkItem[]> {
  const folder = await ensureFlyoutBookmarksFolder();
  const children =
    folder.children ?? ((await browser.bookmarks.getChildren(folder.id)) as BookmarkNode[]);

  const items: BookmarkItem[] = [];
  for (const node of children) {
    if (!node.url) continue;
    items.push({
      id: node.id,
      title: node.title?.trim() || node.url,
      url: node.url,
    });
  }
  return items;
}

/**
 * Create a bookmark in the Paper Plane folder. No-op if the same URL already exists there.
 * @returns `'created'` or `'exists'` (silent skip for duplicates).
 */
export async function createFlyoutBookmark(
  title: string,
  url: string,
): Promise<'created' | 'exists'> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error('Cannot bookmark a tab without a URL.');
  }

  const folder = await ensureFlyoutBookmarksFolder();
  const children =
    folder.children ?? ((await browser.bookmarks.getChildren(folder.id)) as BookmarkNode[]);

  if (children.some((node) => node.url === trimmedUrl)) {
    return 'exists';
  }

  await browser.bookmarks.create({
    parentId: folder.id,
    title: title.trim() || trimmedUrl,
    url: trimmedUrl,
  });
  return 'created';
}

/** Remove a bookmark by id (Paper Plane folder item). */
export async function removeFlyoutBookmark(id: string): Promise<void> {
  if (!isBookmarksApiAvailable()) {
    throw new Error(
      'Bookmarks permission is unavailable. Reload the extension after granting bookmarks access.',
    );
  }
  await browser.bookmarks.remove(id);
}

/** Focus an existing tab with this URL, or open a new tab. */
export async function openOrFocusUrl(url: string): Promise<void> {
  const tabs = await browser.tabs.query({});
  const match = tabs.find(
    (tab): tab is typeof tab & { id: number; windowId: number } =>
      typeof tab.id === 'number' &&
      typeof tab.windowId === 'number' &&
      tab.url === url,
  );
  if (match) {
    await activateTab(match.id, match.windowId);
    return;
  }
  await browser.tabs.create({ url });
}
