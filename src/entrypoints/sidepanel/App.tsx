import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AppLauncher, REFRESHABLE_APPS, type AppView } from '@/components/AppLauncher';
import { CalendarSection } from '@/components/CalendarSection';
import { GmailSection } from '@/components/GmailSection';
import { GoogleAppEmbed } from '@/components/GoogleAppEmbed';
import { SettingsSection } from '@/components/SettingsSection';
import { SignInCard } from '@/components/SignInCard';
import { TasksSection } from '@/components/TasksSection';
import { TabsSection } from '@/components/TabsSection';
import { TodaySection } from '@/components/TodaySection';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/hooks/useSettings';
import {
  getUserInfo,
  isSignedIn,
  signIn,
  signOut,
  switchAccount,
  type GoogleUser,
} from '@/lib/google/api';
import {
  subscribeBrowserTheme,
  syncDocumentAppearance,
} from '@/lib/chrome-theme';
import {
  isLauncherAppId,
  isVerticalNav,
  resolveInitialApp,
  resolveStartupApp,
  type LauncherAppId,
} from '@/lib/settings';
import { cn } from '@/lib/utils';

type RefreshTokens = Record<
  'today' | 'gmail' | 'calendar' | 'tasks' | 'tabs' | 'keep',
  number
>;

function panelClass(isActive: boolean) {
  return cn(
    'absolute inset-0 h-full w-full',
    isActive ? 'visible z-[1]' : 'invisible pointer-events-none z-0',
  );
}

export default function App() {
  const {
    ready: settingsReady,
    enabledApps,
    defaultApp,
    appOrder,
    lastApp,
    navPosition,
    navAlign,
    theme,
    newTabPosition,
    setAppEnabled,
    setDefaultApp,
    setAppOrder,
    setLastApp,
    setNavPosition,
    setNavAlign,
    setTheme,
    setNewTabPosition,
  } = useSettings();

  const [view, setView] = useState<AppView | null>(null);
  const [mountedViews, setMountedViews] = useState<ReadonlySet<AppView>>(
    () => new Set<AppView>(),
  );
  const [refreshTokens, setRefreshTokens] = useState<RefreshTokens>({
    today: 0,
    gmail: 0,
    calendar: 0,
    tasks: 0,
    tabs: 0,
    keep: 0,
  });
  const [refreshingApp, setRefreshingApp] = useState<LauncherAppId | null>(null);
  const prefsInitialized = useRef(false);

  const refreshingHandlers = useMemo(() => {
    const make = (id: LauncherAppId) => (refreshing: boolean) => {
      setRefreshingApp((prev) => {
        if (refreshing) return id;
        return prev === id ? null : prev;
      });
    };
    return {
      today: make('today'),
      gmail: make('gmail'),
      calendar: make('calendar'),
      tasks: make('tasks'),
      tabs: make('tabs'),
      keep: make('keep'),
    };
  }, []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  function handleViewChange(next: AppView) {
    setRefreshingApp(null);
    setView(next);
  }

  function handleRefreshActive(id: LauncherAppId) {
    if (!REFRESHABLE_APPS.has(id)) return;
    const key = id as keyof RefreshTokens;
    setRefreshingApp(id);
    setRefreshTokens((prev) => ({ ...prev, [key]: prev[key] + 1 }));
  }

  useEffect(() => {
    if (!settingsReady) return;

    if (!prefsInitialized.current) {
      setView(resolveStartupApp(enabledApps, defaultApp, appOrder, lastApp));
      prefsInitialized.current = true;
      return;
    }

    setView((current) => {
      if (current === null || current === 'settings') return current;
      if (isLauncherAppId(current) && !enabledApps[current]) {
        return resolveInitialApp(enabledApps, defaultApp, appOrder);
      }
      return current;
    });
  }, [settingsReady, enabledApps, defaultApp, appOrder, lastApp]);

  useEffect(() => {
    void syncDocumentAppearance(theme);

    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onOsSchemeChange = () => {
      // Only matters when no store/extension theme colors are available.
      void syncDocumentAppearance('system');
    };
    media.addEventListener('change', onOsSchemeChange);

    const unsubTheme = subscribeBrowserTheme(() => {
      void syncDocumentAppearance('system');
    });

    // Re-apply when the panel becomes visible again — not on every window focus,
    // which fires when clicking rows and briefly flashes chrome-derived colors.
    const reapply = () => {
      if (document.visibilityState !== 'visible') return;
      void syncDocumentAppearance('system');
    };
    document.addEventListener('visibilitychange', reapply);

    return () => {
      media.removeEventListener('change', onOsSchemeChange);
      unsubTheme();
      document.removeEventListener('visibilitychange', reapply);
    };
  }, [theme]);

  useEffect(() => {
    if (!prefsInitialized.current || view === null) return;
    void setLastApp(view);
  }, [view, setLastApp]);

  useEffect(() => {
    if (view === null || view === 'settings') return;
    setMountedViews((prev) => {
      if (prev.has(view)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(view);
      return nextSet;
    });
  }, [view]);

  const authViewsMounted =
    mountedViews.has('today') ||
    mountedViews.has('gmail') ||
    mountedViews.has('calendar') ||
    mountedViews.has('tasks');
  const needsAuthState = authViewsMounted || view === 'settings';

  const refreshAuth = useCallback(async () => {
    try {
      const ok = await isSignedIn();
      if (!ok) {
        setAuthed(false);
        setUser(null);
        return;
      }
      setAuthed(true);
      try {
        const info = await getUserInfo();
        setUser(info);
      } catch {
        setUser(null);
      }
    } catch {
      setAuthed(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!needsAuthState) return;
    let cancelled = false;
    void (async () => {
      try {
        const ok = await isSignedIn();
        if (cancelled) return;
        if (!ok) {
          setAuthed(false);
          setUser(null);
          return;
        }
        setAuthed(true);
        try {
          const info = await getUserInfo();
          if (!cancelled) setUser(info);
        } catch {
          if (!cancelled) setUser(null);
        }
      } catch {
        if (!cancelled) {
          setAuthed(false);
          setUser(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsAuthState]);

  async function handleSignIn() {
    setSignInLoading(true);
    setSignInError(null);
    setAccountError(null);
    try {
      await signIn();
      setAuthed(true);
      const info = await getUserInfo();
      setUser(info);
    } catch (err) {
      setAuthed(false);
      setUser(null);
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      setSignInError(message);
      setAccountError(message);
    } finally {
      setSignInLoading(false);
    }
  }

  async function handleSwitchAccount() {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const info = await switchAccount();
      setAuthed(true);
      setUser(info);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not switch account');
      await refreshAuth();
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleSignOut() {
    setAccountBusy(true);
    setAccountError(null);
    try {
      await signOut();
      setAuthed(false);
      setUser(null);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Sign-out failed');
    } finally {
      setAccountBusy(false);
    }
  }

  const authKey = user?.email ?? 'signed-out';

  function renderAuthGate(section: ReactNode) {
    return (
      <>
        {authed === null && (
          <p className="text-muted-foreground py-6 text-center text-sm">Checking Google…</p>
        )}
        {authed === false && (
          <SignInCard onSignIn={handleSignIn} loading={signInLoading} error={signInError} />
        )}
        {authed === true && section}
      </>
    );
  }

  if (!settingsReady || view === null) {
    return (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background">
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            Loading…
          </div>
        </div>
      </TooltipProvider>
    );
  }

  const verticalNav = isVerticalNav(navPosition);
  const navFirst = navPosition === 'top' || navPosition === 'left';

  const launcher = (
    <div
      className={cn(
        'shrink-0',
        verticalNav ? 'flex h-full flex-col px-2 py-3' : 'px-3 py-2',
      )}
    >
      <AppLauncher
        activeView={view}
        onViewChange={handleViewChange}
        onRefreshActive={handleRefreshActive}
        refreshingApp={refreshingApp}
        enabledApps={enabledApps}
        appOrder={appOrder}
        onAppOrderChange={(order) => {
          void setAppOrder(order);
        }}
        navPosition={navPosition}
        navAlign={navAlign}
      />
    </div>
  );

  const content = (
    <div className="relative min-h-0 min-w-0 flex-1">
      {mountedViews.has('today') && (
        <div
          className={cn(panelClass(view === 'today'), 'overflow-y-auto px-3 pb-3')}
          aria-hidden={view !== 'today'}
        >
          {renderAuthGate(
            <TodaySection
              key={authKey}
              enabled
              refreshToken={refreshTokens.today}
              onRefreshingChange={refreshingHandlers.today}
            />,
          )}
        </div>
      )}

      {mountedViews.has('gmail') && (
        <div
          className={cn(panelClass(view === 'gmail'), 'overflow-y-auto px-3 pb-3')}
          aria-hidden={view !== 'gmail'}
        >
          {renderAuthGate(
            <GmailSection
              key={authKey}
              enabled
              refreshToken={refreshTokens.gmail}
              onRefreshingChange={refreshingHandlers.gmail}
            />,
          )}
        </div>
      )}

      {mountedViews.has('calendar') && (
        <div
          className={cn(panelClass(view === 'calendar'), 'overflow-y-auto px-3 pb-3')}
          aria-hidden={view !== 'calendar'}
        >
          {renderAuthGate(
            <CalendarSection
              key={authKey}
              enabled
              refreshToken={refreshTokens.calendar}
              onRefreshingChange={refreshingHandlers.calendar}
            />,
          )}
        </div>
      )}

      {mountedViews.has('tasks') && (
        <div
          className={cn(panelClass(view === 'tasks'), 'overflow-y-auto px-3 pb-3')}
          aria-hidden={view !== 'tasks'}
        >
          {renderAuthGate(
            <TasksSection
              key={authKey}
              enabled
              refreshToken={refreshTokens.tasks}
              onRefreshingChange={refreshingHandlers.tasks}
            />,
          )}
        </div>
      )}

      {mountedViews.has('keep') && (
        <div
          className={cn(panelClass(view === 'keep'), 'flex flex-col')}
          aria-hidden={view !== 'keep'}
        >
          <GoogleAppEmbed
            key={refreshTokens.keep}
            appId="keep"
            onRefreshingChange={
              refreshTokens.keep > 0 ? refreshingHandlers.keep : undefined
            }
          />
        </div>
      )}

      {mountedViews.has('tabs') && (
        <div
          className={cn(panelClass(view === 'tabs'), 'overflow-hidden')}
          aria-hidden={view !== 'tabs'}
        >
          <TabsSection
            enabled
            active={view === 'tabs'}
            newTabPosition={newTabPosition}
            refreshToken={refreshTokens.tabs}
            onRefreshingChange={refreshingHandlers.tabs}
          />
        </div>
      )}

      {view === 'settings' && (
        <div className={cn(panelClass(true), 'overflow-y-auto px-3 pb-3')}>
          <SettingsSection
            enabledApps={enabledApps}
            defaultApp={defaultApp}
            navPosition={navPosition}
            navAlign={navAlign}
            theme={theme}
            newTabPosition={newTabPosition}
            onEnabledChange={(id, enabled) => {
              void setAppEnabled(id, enabled);
            }}
            onDefaultAppChange={(id) => {
              void setDefaultApp(id);
            }}
            onNavPositionChange={(position) => {
              void setNavPosition(position);
            }}
            onNavAlignChange={(align) => {
              void setNavAlign(align);
            }}
            onThemeChange={(next) => {
              void setTheme(next);
            }}
            onNewTabPositionChange={(position) => {
              void setNewTabPosition(position);
            }}
            user={user}
            userLoading={authed === null}
            accountBusy={accountBusy || signInLoading}
            accountError={accountError}
            onSignIn={() => {
              void handleSignIn();
            }}
            onSwitchAccount={() => {
              void handleSwitchAccount();
            }}
            onSignOut={() => {
              void handleSignOut();
            }}
          />
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex h-screen bg-background',
          verticalNav ? 'flex-row' : 'flex-col',
        )}
      >
        {navFirst ? launcher : content}
        {navFirst ? content : launcher}
      </div>
    </TooltipProvider>
  );
}
