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

**Alcance de este avance:** está creada la capa de datos cloud-first y su autorización. Todavía no hay pantalla de administración conectada a esta capa ni pruebas de compilación/integración ejecutadas. La validación de códigos únicos se realiza actualmente en la capa de aplicación; debe reforzarse con una operación atómica antes de uso concurrente en producción.


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

- La unicidad de códigos y de empresa principal se valida en la capa de aplicación, pero todavía no está protegida por un índice transaccional; dos administradores concurrentes podrían intentar registrar el mismo código.
- La pantalla usa el permiso general de Ajustes como autorización temporal. Debe crearse un permiso organizacional específico y ampliar el modelo de asignación de usuarios a áreas/sedes/bodegas.
- La autenticación actual todavía mantiene un perfil auxiliar en Dexie. No retirar Dexie hasta reemplazar ese consumidor y los demás que sigan activos.
- No se ha desplegado `firestore.rules` ni se han ejecutado pruebas automatizadas o compilación en este entorno.
