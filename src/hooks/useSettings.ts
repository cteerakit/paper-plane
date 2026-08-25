import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_APP_FALLBACK,
  DEFAULT_APP_GENERATION,
  DEFAULT_APP_ORDER,
  DEFAULT_COLOR_THEME,
  DEFAULT_DEFAULT_APP,
  DEFAULT_ENABLED_APPS,
  DEFAULT_NAV_ALIGN,
  DEFAULT_NAV_POSITION,
  DEFAULT_NEW_TAB_POSITION,
  LAUNCHER_APPS,
  appOrderItem,
  colorThemeItem,
  defaultAppGenerationItem,
  defaultAppItem,
  enabledAppCount,
  enabledAppsItem,
  getEnabledAppIds,
  lastAppItem,
  mergeAppOrder,
  navAlignItem,
  navPositionItem,
  newTabPositionItem,
  parseColorTheme,
  parseLastApp,
  parseNavAlign,
  parseNavPosition,
  parseNewTabPosition,
  resolveInitialApp,
  shouldMigrateDefaultToTabs,
  type AppViewId,
  type ColorTheme,
  type EnabledApps,
  type LauncherAppId,
  type NavAlign,
  type NavPosition,
  type NewTabPosition,
} from '@/lib/settings';

export interface UseSettingsResult {
  ready: boolean;
  enabledApps: EnabledApps;
  defaultApp: LauncherAppId;
  appOrder: LauncherAppId[];
  /** Last viewed page from storage (null on first launch). */
  lastApp: AppViewId | null;
  navPosition: NavPosition;
  navAlign: NavAlign;
  theme: ColorTheme;
  newTabPosition: NewTabPosition;
  /** Enabled apps in persisted order (settings gear is never included). */
  orderedEnabledApps: LauncherAppId[];
  setAppEnabled: (id: LauncherAppId, enabled: boolean) => Promise<void>;
  setDefaultApp: (id: LauncherAppId) => Promise<void>;
  setAppOrder: (order: LauncherAppId[]) => Promise<void>;
  setLastApp: (id: AppViewId) => Promise<void>;
  setNavPosition: (position: NavPosition) => Promise<void>;
  setNavAlign: (align: NavAlign) => Promise<void>;
  setTheme: (theme: ColorTheme) => Promise<void>;
  setNewTabPosition: (position: NewTabPosition) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [ready, setReady] = useState(false);
  const [enabledApps, setEnabledApps] = useState<EnabledApps>(DEFAULT_ENABLED_APPS);
  const [defaultApp, setDefaultAppState] = useState<LauncherAppId>(DEFAULT_DEFAULT_APP);
  const [appOrder, setAppOrderState] = useState<LauncherAppId[]>(DEFAULT_APP_ORDER);
  const [lastApp, setLastAppState] = useState<AppViewId | null>(null);
  const [navPosition, setNavPositionState] = useState<NavPosition>(DEFAULT_NAV_POSITION);
  const [navAlign, setNavAlignState] = useState<NavAlign>(DEFAULT_NAV_ALIGN);
  const [theme, setThemeState] = useState<ColorTheme>(DEFAULT_COLOR_THEME);
  const [newTabPosition, setNewTabPositionState] =
    useState<NewTabPosition>(DEFAULT_NEW_TAB_POSITION);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      enabledAppsItem.getValue(),
      defaultAppItem.getValue(),
      appOrderItem.getValue(),
      lastAppItem.getValue(),
      defaultAppGenerationItem.getValue(),
      navPositionItem.getValue(),
      navAlignItem.getValue(),
      colorThemeItem.getValue(),
      newTabPositionItem.getValue(),
    ]).then(
      ([
        enabled,
        preferred,
        order,
        storedLastApp,
        generation,
        storedNavPosition,
        storedNavAlign,
        storedTheme,
        storedNewTabPosition,
      ]) => {
        if (cancelled) return;
        // Merge so newly added apps (e.g. tabs) pick up defaults for older storage.
        const merged: EnabledApps = { ...DEFAULT_ENABLED_APPS, ...enabled };
        const mergedOrder = mergeAppOrder(order ?? DEFAULT_APP_ORDER);
        const migratedPreferred = shouldMigrateDefaultToTabs(enabled, preferred, generation)
          ? DEFAULT_DEFAULT_APP
          : preferred;
        const safeDefault = resolveInitialApp(merged, migratedPreferred, mergedOrder);
        setEnabledApps(merged);
        setDefaultAppState(safeDefault);
        setAppOrderState(mergedOrder);
        setLastAppState(parseLastApp(storedLastApp));
        setNavPositionState(parseNavPosition(storedNavPosition));
        setNavAlignState(parseNavAlign(storedNavAlign));
        setThemeState(parseColorTheme(storedTheme));
        const parsedNewTabPosition = parseNewTabPosition(storedNewTabPosition);
        setNewTabPositionState(parsedNewTabPosition);
        setReady(true);
        const generationNeedsPersist = generation < DEFAULT_APP_GENERATION;
        const needsPersist =
          LAUNCHER_APPS.some((app) => enabled[app.id] === undefined) ||
          safeDefault !== preferred ||
          generationNeedsPersist ||
          mergedOrder.length !== (order?.length ?? 0) ||
          mergedOrder.some((id, i) => order?.[i] !== id);
        if (needsPersist) {
          void enabledAppsItem.setValue(merged);
          if (safeDefault !== preferred) void defaultAppItem.setValue(safeDefault);
          if (generationNeedsPersist) void defaultAppGenerationItem.setValue(DEFAULT_APP_GENERATION);
          if (
            mergedOrder.some((id, i) => order?.[i] !== id) ||
            mergedOrder.length !== (order?.length ?? 0)
          ) {
            void appOrderItem.setValue(mergedOrder);
          }
        }
        if (storedNewTabPosition !== parsedNewTabPosition) {
          void newTabPositionItem.setValue(parsedNewTabPosition);
        }
      },
    );

    const unwatchEnabled = enabledAppsItem.watch((value) => {
      if (value) setEnabledApps({ ...DEFAULT_ENABLED_APPS, ...value });
    });
    const unwatchDefault = defaultAppItem.watch((value) => {
      if (value) setDefaultAppState(value);
    });
    const unwatchOrder = appOrderItem.watch((value) => {
      if (value) setAppOrderState(mergeAppOrder(value));
    });
    const unwatchLastApp = lastAppItem.watch((value) => {
      setLastAppState(parseLastApp(value));
    });
    const unwatchNavPosition = navPositionItem.watch((value) => {
      setNavPositionState(parseNavPosition(value));
    });
    const unwatchNavAlign = navAlignItem.watch((value) => {
      setNavAlignState(parseNavAlign(value));
    });
    const unwatchTheme = colorThemeItem.watch((value) => {
      setThemeState(parseColorTheme(value));
    });
    const unwatchNewTabPosition = newTabPositionItem.watch((value) => {
      setNewTabPositionState(parseNewTabPosition(value));
    });

    return () => {
      cancelled = true;
      unwatchEnabled();
      unwatchDefault();
      unwatchOrder();
      unwatchLastApp();
      unwatchNavPosition();
      unwatchNavAlign();
      unwatchTheme();
      unwatchNewTabPosition();
    };
  }, []);

  const setAppEnabled = useCallback(
    async (id: LauncherAppId, enabled: boolean) => {
      const next: EnabledApps = { ...enabledApps, [id]: enabled };
      if (!enabled && enabledAppCount(next) < 1) return;

      let nextDefault = defaultApp;
      if (!enabled && defaultApp === id) {
        nextDefault = getEnabledAppIds(next, appOrder)[0] ?? DEFAULT_APP_FALLBACK;
      }

      setEnabledApps(next);
      if (nextDefault !== defaultApp) setDefaultAppState(nextDefault);

      await enabledAppsItem.setValue(next);
      if (nextDefault !== defaultApp) {
        await defaultAppItem.setValue(nextDefault);
      }
    },
    [appOrder, defaultApp, enabledApps],
  );

  const setDefaultApp = useCallback(
    async (id: LauncherAppId) => {
      if (!enabledApps[id]) return;
      setDefaultAppState(id);
      await defaultAppItem.setValue(id);
    },
    [enabledApps],
  );

  const setAppOrder = useCallback(async (order: LauncherAppId[]) => {
    const next = mergeAppOrder(order);
    setAppOrderState(next);
    await appOrderItem.setValue(next);
  }, []);

  const setLastApp = useCallback(async (id: AppViewId) => {
    setLastAppState(id);
    await lastAppItem.setValue(id);
  }, []);

  const setNavPosition = useCallback(async (position: NavPosition) => {
    setNavPositionState(position);
    await navPositionItem.setValue(position);
  }, []);

  const setNavAlign = useCallback(async (align: NavAlign) => {
    setNavAlignState(align);
    await navAlignItem.setValue(align);
  }, []);

  const setTheme = useCallback(async (next: ColorTheme) => {
    setThemeState(next);
    await colorThemeItem.setValue(next);
  }, []);

  const setNewTabPosition = useCallback(async (position: NewTabPosition) => {
    setNewTabPositionState(position);
    await newTabPositionItem.setValue(position);
  }, []);

  return {
    ready,
    enabledApps,
    defaultApp,
    appOrder,
    lastApp,
    navPosition,
    navAlign,
    theme,
    newTabPosition,
    orderedEnabledApps: getEnabledAppIds(enabledApps, appOrder),
    setAppEnabled,
    setDefaultApp,
    setAppOrder,
    setLastApp,
    setNavPosition,
    setNavAlign,
    setTheme,
    setNewTabPosition,
  };
}
