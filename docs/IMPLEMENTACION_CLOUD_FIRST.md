# Implementación cloud-first — avance técnico

## Primer componente incorporado

Se añadió `src/lib/cloud-data.ts`, una capa de acceso a Firestore que no depende de Dexie.

Incluye:
- Lecturas puntuales y listados forzados desde el servidor (`getDocFromServer` y `getDocsFromServer`).
- Creación de documentos con UUID global.
- Metadatos de empresa, usuario creador/modificador, fechas y revisión.
- Actualizaciones transaccionales con control de revisión para detectar cambios concurrentes.
- Eliminación lógica para conservar trazabilidad.
- Suscripciones en tiempo real que informan si la instantánea proviene de caché mediante `fromCache`.
- Validación de sesión y conexión antes de operaciones remotas.

## Alcance real de este avance

La capa está incorporada, pero todavía no ha sido conectada a los módulos de negocio. Las pantallas existentes continúan utilizando Dexie y el sincronizador anterior. Por tanto, **la aplicación aún no es cloud-first de extremo a extremo**.

No se debe retirar Dexie ni desactivar el sincronizador antiguo hasta migrar los módulos y rescatar los datos históricos.

## Próxima secuencia de implementación

1. Añadir pruebas y validación de tipos/build para la capa cloud.
2. Migrar catálogos maestros y sus relaciones a UUID globales.
3. Migrar inventario como libro central de movimientos con operaciones transaccionales.
4. Migrar compras, producción, ventas, despachos, caja y contabilidad.
5. Migrar archivos a Firebase Storage.
6. Reemplazar las reglas permisivas actuales por autorización por empresa, rol, área y bodega.
7. Importar y conciliar los datos locales existentes.
8. Retirar Dexie, el sincronizador antiguo y las funciones offline una vez que ningún módulo dependa de ellos.

## Restricciones operativas

- No confirmar una operación si el servidor no ha confirmado la escritura.
- No usar IDs numéricos locales como identidad compartida.
- No sobrescribir movimientos históricos para resolver conflictos.
- No habilitar escrituras offline.
- No cambiar reglas de seguridad a una versión más permisiva.
- Cada módulo debe migrarse y probarse antes de pasar al siguiente.


## Segundo cambio: autorización por rol en Firestore

Se actualizaron las reglas de `firestore.rules` para que las colecciones de `erp/{company}/{collection}` ya no permitan lectura y escritura a cualquier usuario autenticado.

Las reglas ahora:
- Exigen una asignación activa en `userAccess` vinculada al UID autenticado.
- Consultan el rol y sus permisos almacenados en `accessRoles`.
- Aplican permisos de lectura y escritura según el módulo al que pertenece cada colección.
- Reservan la eliminación física al administrador; las bajas normales deben ser lógicas.
- Mantienen el flujo de bootstrap del administrador inicial.

**Importante:** los cambios del archivo del repositorio no se aplican automáticamente al proyecto Firebase. Antes de probar las pantallas con estas reglas, deben publicarse en Firebase Console o mediante Firebase CLI. Deben probarse con cuentas reales de cada rol y, preferiblemente, con Firebase Emulator Suite.

La seguridad por rol está implementada a nivel de reglas de Firestore para las colecciones mapeadas. La asignación por área, centro y bodega todavía requiere ampliación antes de habilitar operaciones multiárea de producción.


## Inicio de la construcción funcional desde cero

Se confirma que la empresa iniciará la operación sin importar información histórica. Por tanto:
- No se desarrollarán procesos para rescatar, importar ni conciliar datos antiguos de Dexie.
- Los módulos nuevos deben crear sus registros directamente en Firestore.
- Dexie no se considera fuente de datos para la nueva operación y se retirará después de reemplazar sus consumidores en las pantallas existentes.
- No se borran todavía dependencias ni módulos Dexie mientras existan pantallas que los utilicen.

### Primer dominio cloud-first: estructura organizacional

Se añadió `src/lib/cloud-organization.ts` con operaciones de servidor para administrar unidades organizacionales:
- Empresa.
- Sedes o plantas.
- Áreas.
- Bodegas.
- Líneas de producción.

Cada registro usa UUID global, auditoría de creación/modificación y control de revisión heredados de `cloud-data.ts`. Las unidades se desactivan en lugar de borrarse físicamente. La jerarquía se valida antes de crear y no se permite desactivar una unidad que tenga unidades hijas activas.

La colección `organizationUnits` quedó vinculada al permiso de configuración en las reglas de Firestore.

**Alcance de este avance:** está creada la capa de datos cloud-first y su autorización. Todavía no hay pantalla de administración conectada a esta capa ni pruebas de compilación/integración ejecutadas. Los códigos de unidades organizacionales y la existencia de una empresa principal se protegen con índices y transacciones atómicas.


### Pantalla de estructura organizacional

Se incorporó `src/routes/organization.tsx` y se registró la ruta `/organization` en el árbol de rutas. La pantalla:
- Consulta unidades directamente desde Firestore.
- Permite crear empresa, sedes/plantas, áreas, bodegas y líneas de producción.
- Solicita unidad superior cuando la jerarquía lo requiere.
- Permite activar/desactivar unidades, conservando los documentos.
- Muestra el estado de la operación y errores de conexión/permisos.
- Está disponible para usuarios con permiso de escritura en Ajustes; las reglas Firestore aplican ese mismo permiso a `organizationUnits`.

Se añadió el acceso desde el menú de módulos y la navegación lateral.

### Limitaciones pendientes antes de producción

- La unicidad de códigos y de empresa principal se protege mediante `organizationUnitCodeIndexes` y transacciones de Firestore.
- La pantalla usa el permiso general de Ajustes como autorización temporal. Debe crearse un permiso organizacional específico y ampliar el modelo de asignación de usuarios a áreas/sedes/bodegas.
- La autenticación actual todavía mantiene un perfil auxiliar en Dexie. No retirar Dexie hasta reemplazar ese consumidor y los demás que sigan activos.
- No se ha desplegado `firestore.rules` ni se han ejecutado pruebas automatizadas o compilación en este entorno.


### Catálogo cloud-first y control de inventario

Se añadieron dos repositorios de dominio:

- `src/lib/cloud-catalog.ts`: categorías y productos con UUID, auditoría, revisiones para concurrencia y códigos/SKU/códigos de barras únicos mediante documentos índice escritos en transacciones.
- `src/lib/cloud-inventory.ts`: saldos por producto y bodega, consulta de movimientos y registro atómico de entradas, salidas y ajustes. Cada movimiento conserva saldo anterior y posterior, motivo, responsable y referencia opcional.

Reglas de integridad añadidas:
- Los productos deben referenciar una categoría activa.
- No se puede desactivar una categoría que tenga productos activos; la verificación se ejecuta dentro de la transacción.
- No se puede desactivar un producto con existencias ni una bodega con saldos positivos. La validación se hace dentro de la transacción para evitar carreras con movimientos simultáneos.
- No se permite registrar dos productos con el mismo código, SKU o código de barras.
- El movimiento y la actualización del saldo se confirman en una sola transacción.
- No se permiten existencias negativas.
- El historial de `inventoryMovements` es de solo creación: no se puede modificar ni borrar desde el cliente.
- Cada movimiento exige una clave de idempotencia para que un reintento no duplique entradas o salidas.
- Los traslados entre bodegas actualizan ambos saldos y generan los dos movimientos vinculados en una sola transacción; también son idempotentes.
- Los saldos se separan por producto, bodega y lote. Las entradas, salidas, ajustes y traslados conservan el código de lote y la fecha de vencimiento; no se permite recibir, consumir ni trasladar un lote vencido; las materias primas y productos terminados exigen fecha de vencimiento.
- La consulta de unidades organizacionales tipo bodega admite lectura para usuarios con permiso de Inventario; su administración sigue protegida por Ajustes.

**Importante:** estas capas de datos todavía no sustituyen las pantallas actuales. Productos, categorías, POS, producción e inventario siguen teniendo consumidores Dexie y no deben mezclarse con estos repositorios hasta migrar sus flujos relacionados. No se ha desplegado Firestore Rules ni se han ejecutado compilación, emulador o pruebas de integración.

**Pendientes técnicos:** añadir paginación para catálogos grandes, probar movimientos por lote y transferencias entre bodegas, conectar adjuntos/fotos a Firebase Storage, aplicar alcance por sede/área/bodega en las reglas y realizar pruebas concurrentes de índices y saldos.


### Fórmulas versionadas y órdenes de producción

Se añadió `src/lib/cloud-production.ts` como base del módulo de producción láctea:

- Fórmulas separadas por leche líquida y leche en polvo.
- Cada fórmula define producto terminado, rendimiento, unidad e ingredientes/materiales de empaque.
- Los materiales deben existir como productos activos y usar su unidad base.
- Crear una modificación genera una nueva versión; no sobrescribe las versiones anteriores.
- Las versiones se crean en borrador y solo la versión más reciente puede aprobarse.
- Firestore restringe las versiones a una transición de borrador a aprobada; una versión aprobada no se puede modificar ni borrar desde el cliente.
- Las órdenes guardan una copia de la fórmula, la versión aprobada, los productos, unidades, costos estándar y cantidades calculadas.
- La creación de órdenes usa clave de idempotencia para evitar duplicados cuando se reintenta una petición.

**Alcance actual:** están implementadas las operaciones de creación de fórmulas, creación de versiones, aprobación y creación de órdenes en borrador. Todavía falta la pantalla de producción y el cierre transaccional de la orden que consuma lotes de materias primas y registre el lote del producto terminado. No se debe usar aún como flujo productivo completo.
