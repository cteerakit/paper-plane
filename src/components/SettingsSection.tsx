import { LogIn, LogOut, RefreshCw } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cardSurfaceClass } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { GoogleUser } from '@/lib/google/api';
import {
  LAUNCHER_APPS,
  enabledAppCount,
  isVerticalNav,
  type ColorTheme,
  type EnabledApps,
  type LauncherAppId,
  type NavAlign,
  type NavPosition,
  type NewTabPosition,
} from '@/lib/settings';
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  openLegalUrl,
} from '@/lib/legal';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  enabledApps: EnabledApps;
  defaultApp: LauncherAppId;
  navPosition: NavPosition;
  navAlign: NavAlign;
  theme: ColorTheme;
  newTabPosition: NewTabPosition;
  onEnabledChange: (id: LauncherAppId, enabled: boolean) => void;
  onDefaultAppChange: (id: LauncherAppId) => void;
  onNavPositionChange: (position: NavPosition) => void;
  onNavAlignChange: (align: NavAlign) => void;
  onThemeChange: (theme: ColorTheme) => void;
  onNewTabPositionChange: (position: NewTabPosition) => void;
  user: GoogleUser | null;
  userLoading?: boolean;
  accountBusy?: boolean;
  accountError?: string | null;
  onSignIn: () => void;
  onSwitchAccount: () => void;
  onSignOut: () => void;
}

type AuthProviderId = 'google' | 'microsoft' | 'apple';
type AuthProviderStatus = 'available' | 'coming_soon';

interface AuthProvider {
  id: AuthProviderId;
  name: string;
  status: AuthProviderStatus;
}

const AUTH_PROVIDERS: AuthProvider[] = [
  { id: 'google', name: 'Google', status: 'available' },
  { id: 'microsoft', name: 'Microsoft', status: 'coming_soon' },
  { id: 'apple', name: 'Apple', status: 'coming_soon' },
];

const NAV_POSITION_OPTIONS: Array<{ value: NavPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const THEME_OPTIONS: Array<{ value: ColorTheme; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const NEW_TAB_POSITION_OPTIONS: Array<{ value: NewTabPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

function initials(user: GoogleUser): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function ProviderIcon({ id, className }: { id: AuthProviderId; className?: string }) {
  const iconClass = cn('size-4 shrink-0', className);

  switch (id) {
    case 'google':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      );
    case 'microsoft':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#F25022" d="M1 1h10v10H1z" />
          <path fill="#7FBA00" d="M13 1h10v10H13z" />
          <path fill="#00A4EF" d="M1 13h10v10H1z" />
          <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
      );
    case 'apple':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
          />
        </svg>
      );
  }
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="bg-muted flex flex-wrap gap-0.5 rounded-lg p-0.5"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={selected}
            className={cn(
              'h-8 flex-1 px-2 text-xs',
              selected
                ? 'bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary hover:text-primary-foreground'
                : 'text-muted-foreground font-normal hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

interface ConnectedAccountsSectionProps {
  user: GoogleUser | null;
  userLoading?: boolean;
  accountBusy?: boolean;
  accountError?: string | null;
  onSignIn: () => void;
  onSwitchAccount: () => void;
  onSignOut: () => void;
}

function ConnectedAccountsSection({
  user,
  userLoading,
  accountBusy,
  accountError,
  onSignIn,
  onSwitchAccount,
  onSignOut,
}: ConnectedAccountsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Connected accounts</h2>
      <p className="text-muted-foreground text-xs">
        Connect accounts to load mail, calendar, and tasks. Note uses your Chrome session
        separately.
      </p>

      <div className="flex flex-col gap-2">
        {AUTH_PROVIDERS.map((provider) => {
          const isComingSoon = provider.status === 'coming_soon';
          const isGoogle = provider.id === 'google';

          return (
            <div
              key={provider.id}
              className={cn(
                cardSurfaceClass,
                'flex flex-col gap-3',
                isComingSoon && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <ProviderIcon id={provider.id} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{provider.name}</p>

                    {isComingSoon && (
                      <p className="text-muted-foreground mt-0.5 text-xs">Coming soon</p>
                    )}

                    {isGoogle && userLoading && !user && (
                      <p className="text-muted-foreground mt-0.5 text-xs">Checking…</p>
                    )}

                    {isGoogle && !userLoading && !user && (
                      <p className="text-muted-foreground mt-0.5 text-xs">Not connected</p>
                    )}

                    {isGoogle && user && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Avatar className="size-7">
                          {user.picture ? <AvatarImage src={user.picture} alt="" /> : null}
                          <AvatarFallback className="text-[10px]">
                            {initials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{user.name}</p>
                          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isComingSoon && (
                  <Badge variant="secondary" className="shrink-0">
                    Coming soon
                  </Badge>
                )}
              </div>

              {isGoogle && (
                <div className="flex flex-wrap items-center gap-2">
                  {user ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={accountBusy}
                        onClick={onSwitchAccount}
                      >
                        <RefreshCw className="size-3.5" />
                        Switch
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={accountBusy}
                            className="text-muted-foreground"
                          >
                            <LogOut className="size-3.5" />
                            Sign out
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Sign out?</AlertDialogTitle>
                            <AlertDialogDescription>
                              You&apos;ll need to connect Google again for Email, Calendar, Task,
                              and Today.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={accountBusy}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={accountBusy}
                              onClick={onSignOut}
                            >
                              Sign out
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    !userLoading && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={accountBusy}
                        onClick={onSignIn}
                      >
                        <LogIn className="size-3.5" />
                        Connect
                      </Button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {accountError && <p className="text-destructive text-sm">{accountError}</p>}
    </section>
  );
}

export function SettingsSection({
  enabledApps,
  defaultApp,
  navPosition,
  navAlign,
  theme,
  newTabPosition,
  onEnabledChange,
  onDefaultAppChange,
  onNavPositionChange,
  onNavAlignChange,
  onThemeChange,
  onNewTabPositionChange,
  user,
  userLoading,
  accountBusy,
  accountError,
  onSignIn,
  onSwitchAccount,
  onSignOut,
}: SettingsSectionProps) {
  const enabledCount = enabledAppCount(enabledApps);
  const vertical = isVerticalNav(navPosition);
  const alignOptions: Array<{ value: NavAlign; label: string }> = vertical
    ? [
        { value: 'start', label: 'Top' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'Bottom' },
      ]
    : [
        { value: 'start', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'Right' },
      ];

  return (
    <div className="flex flex-col gap-6 px-1 py-2">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose which apps appear in the side panel and which opens by default.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Appearance</h2>
        <p className="text-muted-foreground text-xs">
          System follows your OS light/dark. Light and Dark use Paper Plane’s fixed
          palettes.
        </p>

        <div className="flex flex-col gap-2">
          <Label className="text-xs font-medium">Theme</Label>
          <SegmentedControl
            ariaLabel="Color theme"
            value={theme}
            options={THEME_OPTIONS}
            onChange={onThemeChange}
          />
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Navigation</h2>
        <p className="text-muted-foreground text-xs">
          Place the app bar and choose how icons pack along it.
        </p>

        <div className="flex flex-col gap-2">
          <Label className="text-xs font-medium">Position</Label>
          <SegmentedControl
            ariaLabel="Navigation position"
            value={navPosition}
            options={NAV_POSITION_OPTIONS}
            onChange={onNavPositionChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs font-medium">Align</Label>
          <SegmentedControl
            ariaLabel="Navigation alignment"
            value={navAlign}
            options={alignOptions}
            onChange={onNavAlignChange}
          />
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Tabs</h2>
        <p className="text-muted-foreground text-xs">
          Choose where New tab appears on the Tabs page.
        </p>

        <div className="flex flex-col gap-2">
          <Label className="text-xs font-medium">New tab</Label>
          <SegmentedControl
            ariaLabel="New tab position"
            value={newTabPosition}
            options={NEW_TAB_POSITION_OPTIONS}
            onChange={onNewTabPositionChange}
          />
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Show apps</h2>
        <p className="text-muted-foreground text-xs">
          Toggle visibility and pick which app opens by default.
        </p>
        <div className="flex flex-col gap-3">
          {LAUNCHER_APPS.map((app) => {
            const checked = enabledApps[app.id];
            const isLastEnabled = checked && enabledCount <= 1;
            const isDefault = defaultApp === app.id;

            return (
              <div key={app.id} className="flex items-center justify-between gap-3">
                <Label htmlFor={`show-${app.id}`} className="min-w-0 flex-1 font-normal">
                  {app.label}
                </Label>
                <div className="flex shrink-0 items-center gap-2">
                  {checked &&
                    (isDefault ? (
                      <span className="text-muted-foreground text-xs">Default</span>
                    ) : (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline-offset-2 hover:underline"
                        onClick={() => onDefaultAppChange(app.id)}
                      >
                        Make default
                      </button>
                    ))}
                  <Switch
                    id={`show-${app.id}`}
                    checked={checked}
                    disabled={isLastEnabled}
                    onCheckedChange={(next) => onEnabledChange(app.id, next)}
                    aria-label={
                      isLastEnabled
                        ? `Keep ${app.label} visible (at least one app required)`
                        : `Show ${app.label}`
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        {enabledCount <= 1 && (
          <p className="text-muted-foreground text-xs">At least one app must stay visible.</p>
        )}
      </section>

      <Separator />

      <ConnectedAccountsSection
        user={user}
        userLoading={userLoading}
        accountBusy={accountBusy}
        accountError={accountError}
        onSignIn={onSignIn}
        onSwitchAccount={onSwitchAccount}
        onSignOut={onSignOut}
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Legal</h2>
        <p className="text-muted-foreground text-xs">
          How Paper Plane handles data and the terms for using the extension.
        </p>
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            className="text-foreground h-9 justify-start px-2 font-normal"
            onClick={() => openLegalUrl(PRIVACY_POLICY_URL)}
          >
            Privacy Policy
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-foreground h-9 justify-start px-2 font-normal"
            onClick={() => openLegalUrl(TERMS_OF_SERVICE_URL)}
          >
            Terms of Service
          </Button>
        </div>
      </section>
    </div>
  );
}
