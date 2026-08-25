const KEEP_REQUEST_RULE_ID = 9001;
const ACCOUNTS_REQUEST_RULE_ID = 9004;

type EmbedRuleConfig = {
  id: number;
  urlFilter: string;
  referer: string;
  label: string;
};

async function setupAppEmbedRules(config: EmbedRuleConfig): Promise<void> {
  const requestHeaders = [
    { header: 'sec-fetch-dest', operation: 'set' as const, value: 'document' },
    { header: 'sec-fetch-mode', operation: 'set' as const, value: 'navigate' },
    { header: 'sec-fetch-site', operation: 'set' as const, value: 'none' },
    { header: 'sec-fetch-user', operation: 'set' as const, value: '?1' },
    { header: 'referer', operation: 'set' as const, value: config.referer },
  ];

  const responseHeaders = [
    { header: 'x-frame-options', operation: 'remove' as const },
    { header: 'content-security-policy', operation: 'remove' as const },
    { header: 'content-security-policy-report-only', operation: 'remove' as const },
  ];

  const rule = {
    id: config.id,
    priority: 100,
    action: {
      type: 'modifyHeaders' as const,
      requestHeaders,
      responseHeaders,
    },
    condition: {
      urlFilter: config.urlFilter,
      resourceTypes: ['sub_frame', 'main_frame', 'xmlhttprequest', 'other'] as const,
    },
  };

  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [config.id],
      addRules: [rule as unknown as Browser.declarativeNetRequest.Rule],
    });
  } catch (error) {
    console.warn(
      `${config.label} DNR rule with request headers failed, retrying without sec-fetch`,
      error,
    );
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [config.id],
      addRules: [
        {
          ...rule,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'referer', operation: 'set', value: config.referer },
            ],
            responseHeaders,
          },
        } as unknown as Browser.declarativeNetRequest.Rule,
      ],
    });
  }
}

export async function setupKeepEmbedRules(): Promise<void> {
  await setupAppEmbedRules({
    id: KEEP_REQUEST_RULE_ID,
    urlFilter: '||keep.google.com',
    referer: 'https://keep.google.com/',
    label: 'Keep',
  });
}

/** Auth redirects often load in the embed frame; match Keep-style header rewrites. */
export async function setupAccountsEmbedRules(): Promise<void> {
  await setupAppEmbedRules({
    id: ACCOUNTS_REQUEST_RULE_ID,
    urlFilter: '||accounts.google.com',
    referer: 'https://accounts.google.com/',
    label: 'Accounts',
  });
}

export async function setupGoogleEmbedRules(): Promise<void> {
  // Also drop any leftover Gmail iframe DNR rule from older builds (id 9003).
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [9003],
  }).catch(() => undefined);

  await Promise.all([
    setupKeepEmbedRules(),
    setupAccountsEmbedRules(),
  ]);
}

function cookieUrl(cookie: Browser.cookies.Cookie): string {
  const host = cookie.domain.replace(/^\./, '');
  const protocol = cookie.secure ? 'https' : 'http';
  return `${protocol}://${host}${cookie.path}`;
}

/** Relax SameSite so Google auth cookies can be sent in extension side-panel iframes. */
export async function relaxGoogleCookiesForIframe(): Promise<void> {
  const groups = await Promise.all([
    browser.cookies.getAll({ domain: 'google.com' }),
    browser.cookies.getAll({ domain: 'keep.google.com' }),
    browser.cookies.getAll({ domain: 'accounts.google.com' }),
  ]);

  const seen = new Set<string>();
  for (const cookie of groups.flat()) {
    const key = `${cookie.domain}|${cookie.name}|${cookie.path}|${cookie.storeId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (cookie.sameSite === 'no_restriction' && cookie.secure) continue;

    try {
      await browser.cookies.set({
        url: cookieUrl(cookie),
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: true,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: 'no_restriction',
        storeId: cookie.storeId,
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
      });
    } catch (error) {
      console.warn('Could not relax cookie', cookie.name, cookie.domain, error);
    }
  }
}

export const EMBED_APPS_NEEDING_COOKIE_RELAXATION = ['keep'] as const;
