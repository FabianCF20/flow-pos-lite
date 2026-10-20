# Architecture rules

- Keep production offline in Dexie alongside inventory; completing an order atomically writes material consumption, finished stock, costs and kardex to prevent partial or duplicate postings.
- Store editable company measures and recipes separately, and snapshot conversions on production orders; protect referenced conversion definitions so historical and current inventory quantities remain consistent.
- Include all local production tables in backups so restoration preserves inventory evidence and unit references.