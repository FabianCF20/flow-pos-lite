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
