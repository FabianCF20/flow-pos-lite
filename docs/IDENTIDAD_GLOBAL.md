# Auditoría y diseño de identidad global

## Objetivo

Preparar los datos locales de Flow POS Lite para que varias estaciones de trabajo compartan registros y relaciones sin colisiones. Esta etapa no activa todavía la sincronización de nuevas tablas ni cambia el comportamiento operativo.

## Hallazgos verificados en el código

1. La base local es IndexedDB mediante Dexie, en `src/lib/db.ts`, con la base `pos_offline_db`.
2. Las entidades persistidas usan claves numéricas autoincrementales (`++id`). Ese número solo es único dentro de una instalación local y no puede funcionar como identidad compartida entre dispositivos.
3. Las relaciones de negocio usan esos números: por ejemplo, ventas contienen `productId`, `customerId`, `cashSessionId`; movimientos de inventario contienen `productId`, `warehouseId` y referencias de origen; compras usan `supplierId` y `warehouseId`; órdenes de producción usan `recipeId`, `productId` y `warehouseId`.
4. La sincronización de `src/lib/sync.tsx` solo incluye `products`, `customers` y `suppliers`.
5. Para los documentos sincronizados, el identificador remoto actual se construye como `deviceId-localId`. Esto evita algunas colisiones de documentos, pero no crea una identidad de negocio independiente del dispositivo.
6. El mecanismo actual aplica una política de “última modificación gana” basada en `updatedAt`. No es suficiente para movimientos concurrentes de inventario, caja, compras, despachos o contabilidad.
7. Las reglas actuales de Firestore para `erp/{company}/{collection}/{docId}` permiten leer, crear y actualizar a cualquier usuario autenticado. No aplican permisos por módulo, área, bodega o acción.
8. La sincronización actual no resuelve referencias numéricas entre dispositivos. Ampliar directamente la lista de tablas sincronizadas podría enlazar una venta, compra u orden con otro producto, bodega o usuario que tenga el mismo número local en otro equipo.

## Decisión de diseño

Se conservarán inicialmente los IDs numéricos locales para no romper pantallas, formularios ni servicios existentes. Se añadirá una identidad global UUID independiente del ID local para cada registro que deba compartirse.

- `id`: clave local Dexie; no se transmite como identificador de negocio.
- `globalId`: UUID estable y único; identifica el mismo registro en todos los dispositivos.
- `companyId`: ámbito de empresa para separar datos y preparar el sistema para más de una compañía si se requiere.
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`: auditoría y orden temporal, con reglas consistentes.
- Las relaciones compartidas deberán migrar progresivamente de referencias numéricas locales a referencias globales (por ejemplo, `productGlobalId`). No se eliminarán las referencias numéricas hasta completar la transición y verificar compatibilidad.

Los documentos existentes que ya tienen `remoteId` deberán conservar una correspondencia estable durante la migración. No se debe generar una identidad distinta para el mismo documento al importarlo en otro dispositivo.

## Orden seguro de implementación

### Fase 1 — Inventario y pruebas de relaciones
- Identificar todas las tablas, campos de relación y servicios que crean/actualizan registros.
- Crear pruebas de integridad para ventas, compras, inventario, caja, producción y contabilidad.
- Definir cómo se convierten referencias locales existentes a identidades globales.

### Fase 2 — Identidad global local
- Añadir `globalId` de forma aditiva mediante una nueva versión Dexie.
- Asignar UUID a registros existentes sin cambiar sus IDs numéricos.
- Generar `globalId` automáticamente en nuevos registros.
- Comprobar unicidad y que la migración no altere saldos, consecutivos ni referencias actuales.

### Fase 3 — Relaciones globales
- Incorporar referencias globales en entidades dependientes y en snapshots/documentos que deban conservar trazabilidad.
- Migrar relaciones existentes con una tabla de correspondencia validada.
- Mantener compatibilidad temporal con el código que todavía consume IDs locales.

### Fase 4 — Sincronización por dominios
- Sincronizar primero catálogos y datos maestros.
- Después, movimientos de inventario y producción.
- Luego, compras, ventas, despachos, caja y cartera.
- Finalmente, contabilidad y documentos adjuntos.
- Cada dominio tendrá estrategia de idempotencia, concurrencia, reversión y validación antes de habilitarse.

### Fase 5 — Seguridad y operación central
- Aplicar reglas de Firestore por empresa, usuario, rol, área, bodega y acción.
- Usar transacciones o funciones de servidor para operaciones que afectan saldos, existencias, consecutivos o asientos.
- Registrar auditoría y evitar que dos dispositivos sobrescriban silenciosamente movimientos financieros u operativos.

## Condiciones para considerar lista la identidad global

- Dos dispositivos pueden crear registros sin colisionar.
- El mismo registro conserva el mismo `globalId` después de sincronizarse.
- Todas las relaciones de una operación apuntan al registro correcto en ambos dispositivos.
- La migración conserva los datos existentes y puede repetirse sin duplicar identidades.
- Los IDs numéricos locales siguen funcionando durante la transición.
- Las pruebas cubren registros nuevos, registros antiguos, duplicados, borrados lógicos y conflictos.

## Fuera de esta etapa

No se amplía todavía `SYNCED_TABLES`, no se modifican las reglas de Firestore y no se cambian los servicios de ventas, inventario, producción o contabilidad. Esas acciones requieren completar primero la migración y las pruebas de relaciones. Esta auditoría describe el estado observado del repositorio y el diseño propuesto; no afirma que la identidad global ya esté implementada.
