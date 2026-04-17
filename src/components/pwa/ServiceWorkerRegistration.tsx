"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map(async (registration) => {
              try {
                await registration.unregister();
              } catch (error) {
                console.error("Service Worker unregister failed:", error);
              }
            })
          )
        )
        .catch((error) => {
          console.error("Service Worker cleanup failed:", error);
        });
    }

    if ("caches" in window) {
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
        )
        .catch((error) => {
          console.error("Browser cache cleanup failed:", error);
        });
    }
  }, []);

  return null;
}
