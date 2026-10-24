# Architecture rules

- Keep production offline in Dexie alongside inventory; completing an order atomically writes material consumption, finished stock, costs and kardex to prevent partial or duplicate postings.
- Store editable company measures and recipes separately; resolve chained reference quantities to a canonical group factor, reject cycles and protect referenced conversion definitions. Snapshot order quantities so historical and current inventory quantities remain consistent.
- Include all local production tables in backups so restoration preserves inventory evidence and unit references.