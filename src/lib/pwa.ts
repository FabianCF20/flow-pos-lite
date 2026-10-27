import { allowAppServiceWorker } from "./pwa-policy";

export async function configureAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!allowAppServiceWorker(import.meta.env.PROD, location.hostname, window.self !== window.top, location.search)) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const appWorkers = registrations.filter(registration => [registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === "/sw.js"));
    await Promise.all(appWorkers.map(registration => registration.unregister()));
    // Remove only this app's legacy cache; never touch local inventory or other workers.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("pos-offline-")).map(key => caches.delete(key)));
    return;
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}