import { setupGoogleEmbedRules } from '@/lib/google/keep-embed';

export default defineBackground(() => {
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('sidePanel.setPanelBehavior failed', error));

  setupGoogleEmbedRules().catch((error) =>
    console.error('Failed to setup Google embed rules', error),
  );
});
