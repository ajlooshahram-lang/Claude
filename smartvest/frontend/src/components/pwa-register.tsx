'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker for PWA functionality.
 * This enables:
 *   - "Add to Home Screen" prompt on Android Chrome
 *   - Basic offline caching of the app shell
 *   - App icon and splash screen on mobile
 */
export function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silent fail — PWA is a nice-to-have, not critical
      });
    }
  }, []);

  return null;
}
