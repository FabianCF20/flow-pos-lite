# Architecture rules

- Keep production offline in Dexie alongside inventory; completing an order atomically writes material consumption, finished stock, costs and kardex to prevent partial or duplicate postings.
- Store editable company measures and recipes separately; resolve chained reference quantities to a canonical group factor, reject cycles and protect referenced conversion definitions. Snapshot order quantities so historical and current inventory quantities remain consistent.
- Include all local production tables in backups so restoration preserves inventory evidence and unit references.
- Use the shared desktop-items layout for repeated records, keep toolbars full-span and preserve viewport-bounded navigation and forms so desktop and mobile use the same workflows.
- Generate leaf-page metadata with pageHead or route-specific head definitions so every content view has its own identity.
- Register the app service worker only through the guarded PWA module; development and previews remove the legacy app worker/cache to avoid mixing incompatible cached framework modules, without deleting IndexedDB.