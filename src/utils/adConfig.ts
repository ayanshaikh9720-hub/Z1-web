/**
 * Advertisement Configuration & Google Mobile Ads (AdMob) Integration Helper
 * 
 * Supports:
 * 1. Web: Responsive Google AdSense / Publisher Tag placements.
 * 2. Android (Capacitor): Google Mobile Ads SDK configuration.
 * 
 * Policy Compliance:
 * - Ad containers remain completely hidden when no valid ad configuration exists.
 * - No fake ads or fabricated earnings are ever displayed.
 * - Uses official Google AdMob test ad unit IDs during development.
 * - Private credentials and production Ad unit IDs are loaded via environment variables.
 */

export interface AdConfiguration {
  enabled: boolean;
  isTestMode: boolean;
  adSenseClientId?: string;
  adSenseSlotTopBanner?: string;
  adSenseSlotBetweenSections?: string;
  adMobAppId?: string;
  adMobBannerUnitId?: string;
  adMobInterstitialUnitId?: string;
}

// Official Google AdMob Test Ad Unit IDs (Google Mobile Ads SDK official documentation)
export const ADMOB_TEST_CONFIG = {
  // Official Android Sample App ID
  appId: 'ca-app-pub-3940256099942544~3347511713',
  // Official Android Adaptive Banner Test ID
  bannerUnitId: 'ca-app-pub-3940256099942544/6300978111',
  // Official Android Interstitial Test ID
  interstitialUnitId: 'ca-app-pub-3940256099942544/1033173712',
};

/**
 * Returns the active ad configuration based on environment variables.
 * Defaults to disabled unless explicitly configured with valid IDs.
 */
export function getAdConfig(): AdConfiguration {
  const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};
  
  const enabledFlag = env.VITE_ENABLE_ADS === 'true' || env.VITE_ENABLE_ADS === true;
  const isTestMode = env.VITE_AD_TEST_MODE !== 'false';

  const adSenseClientId = env.VITE_ADSENSE_CLIENT_ID || '';
  const adMobBannerUnitId = env.VITE_ADMOB_BANNER_ID || (isTestMode && enabledFlag ? ADMOB_TEST_CONFIG.bannerUnitId : '');

  // Active only if explicitly enabled AND at least one valid ad client/unit ID is configured
  const hasValidConfig = Boolean(adSenseClientId || adMobBannerUnitId);
  const enabled = enabledFlag && hasValidConfig;

  return {
    enabled,
    isTestMode,
    adSenseClientId: adSenseClientId || undefined,
    adSenseSlotTopBanner: env.VITE_ADSENSE_SLOT_TOP || undefined,
    adSenseSlotBetweenSections: env.VITE_ADSENSE_SLOT_BETWEEN || undefined,
    adMobAppId: env.VITE_ADMOB_APP_ID || (isTestMode ? ADMOB_TEST_CONFIG.appId : undefined),
    adMobBannerUnitId: adMobBannerUnitId || undefined,
    adMobInterstitialUnitId: env.VITE_ADMOB_INTERSTITIAL_ID || (isTestMode ? ADMOB_TEST_CONFIG.interstitialUnitId : undefined),
  };
}

/**
 * Checks if ads are enabled and properly configured.
 * When false, all ad containers MUST remain completely hidden.
 */
export function isAdsEnabled(): boolean {
  return getAdConfig().enabled;
}
