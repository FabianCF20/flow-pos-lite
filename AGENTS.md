# Architecture rules

- Firebase is the only operational data platform. Use Firebase Authentication for identity, Cloud Firestore for all business records and transactions, and Firebase Storage for binary files and attachments.
- Do not add Dexie, IndexedDB, local business databases, offline write queues, or client-side persistence of sales, inventory, purchases, cash, accounting, or production operations.
- All business reads and writes must go through typed Firebase repositories. A successful save means the server confirmed the write; when offline, block business writes and clearly report the connection error.
- Use stable global document IDs and references. Never use device-local auto-increment IDs as shared business identifiers.
- Critical workflows (sales, inventory movements, purchasing, dispatch, production, cash closing, and accounting) must use server-validated transactions or trusted backend functions, idempotency keys, audit fields, and immutable history where appropriate.
- Enforce company, role, module, and warehouse/production-area permissions in Firestore Rules or trusted backend code. UI permissions alone are not security.
- Retire Dexie only after every screen and service has been migrated, local historical data has been backed up and reconciled, and no runtime or test imports remain. Do not delete local user data before a verified migration.
- Store attachment metadata in Firestore and file binaries in Firebase Storage; do not store large base64 files in Firestore documents.
- Store editable company measures and recipes separately; resolve chained reference quantities to a canonical group factor, reject cycles and protect referenced conversion definitions. Snapshot order quantities so historical and current inventory quantities remain consistent.
- Completing a production order must atomically validate and record material consumption, finished output, costs, lots, and inventory movements, preventing partial or duplicate postings.
- Use the shared desktop-items layout for repeated records, keep toolbars full-span and preserve viewport-bounded navigation and forms so desktop and mobile use the same workflows.
- Generate leaf-page metadata with pageHead or route-specific head definitions so every content view has its own identity.
- Register the app service worker only through the guarded PWA module. It may cache the application shell, but it must never be treated as business-data storage.
