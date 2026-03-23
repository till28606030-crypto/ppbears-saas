import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Declare gtag on window so TypeScript doesn't complain
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const SCRIPT_ID_GTAG = 'ppbears-gtag-loader';
const SCRIPT_ID_INIT  = 'ppbears-gtag-init';

function removeInjectedScripts() {
  document.getElementById(SCRIPT_ID_GTAG)?.remove();
  document.getElementById(SCRIPT_ID_INIT)?.remove();
}

function injectGtag(ga4Id: string, adsId: string) {
  // Prevent duplicate injection
  if (document.getElementById(SCRIPT_ID_GTAG)) return;

  // 1. Async loader script
  const loaderScript = document.createElement('script');
  loaderScript.id   = SCRIPT_ID_GTAG;
  loaderScript.async = true;
  loaderScript.src  = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
  document.head.appendChild(loaderScript);

  // 2. Init script
  const initScript = document.createElement('script');
  initScript.id = SCRIPT_ID_INIT;
  initScript.textContent = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    ${ga4Id ? `gtag('config', '${ga4Id}');` : ''}
    ${adsId  ? `gtag('config', '${adsId}');`  : ''}
  `;
  document.head.appendChild(initScript);
}

/**
 * TrackingProvider
 *
 * Fetches GA4 / Google ADS IDs from `store_settings` in Supabase
 * and dynamically injects the gtag.js scripts into <head>.
 *
 * Designed for SaaS: each tenant configures their own IDs without
 * touching the source code.
 */
export default function TrackingProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('ga4_id, ads_id')
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        const ga4Id = data?.ga4_id?.trim() || '';
        const adsId = data?.ads_id?.trim() || '';

        if (ga4Id || adsId) {
          injectGtag(ga4Id, adsId);
        } else {
          // No tracking IDs configured — remove any stale scripts
          removeInjectedScripts();
        }
      } catch (err) {
        console.warn('[TrackingProvider] Failed to load store_settings:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
