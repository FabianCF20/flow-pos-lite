# Base de datos y modelo de información

## 1. Resumen de arquitectura de datos

La aplicación utiliza **Dexie.js sobre IndexedDB** como almacenamiento operativo local del navegador/dispositivo. La instancia se declara en src/lib/db.ts con el nombre:

- Base local: pos_offline_db
- Motor de acceso: Dexie
- Esquema actual declarado: versión 8
- Identificadores locales: claves numéricas autoincrementales en la mayoría de tablas.

Firebase Authentication gestiona el inicio de sesión y Cloud Firestore guarda perfiles, asignaciones de acceso y una copia sincronizada de un subconjunto del catálogo. Firestore no es, según el código revisado, la base central de todas las transacciones del ERP.

## 2. Tablas locales de IndexedDB

El esquema declara las siguientes tablas:

| Tabla | Contenido principal | Uso |
|---|---|---|
| categories | Nombre y color | Clasificación de productos |
| products | Nombre, SKU, código de barras, precio, costo, stock, unidad, categoría, imagen y estado | Catálogo e inventario |
| customers | Identificación, datos tributarios, contacto, ubicación y condiciones comerciales | Clientes y ventas |
| sales | Consecutivo, caja, usuario, cliente, detalle, totales, pago y estado | Registro de ventas |
| cashSessions | Usuario, apertura, cierre, efectivo inicial y arqueo | Turnos de caja |
| cashMovements | Sesión, tipo, importe, motivo, fecha y usuario | Ingresos y retiros |
| users | Nombre, PIN heredado, correo/UID de Firebase, rol local y estado | Perfil local heredado |
| settings | Datos del negocio, moneda, impuestos, impresora y configuración Factus | Configuración |
| suppliers | Identificación, contacto, ubicación, moneda, Incoterm y condiciones | Proveedores |
| warehouses | Nombre, ubicación y bodega predeterminada | Almacenes |
| stockMoves | Producto, bodega, tipo, cantidad, costo, referencia y fecha | Kardex |
| purchases | Proveedor, bodega, artículos, impuestos, total, pagos y estado | Compras |
| supplierPayments | Compra, importe, método y fecha | Pagos a proveedores |
| receivables | Venta, cliente, saldo, estado y vencimiento | Cuentas por cobrar |
| arPayments | Cuenta por cobrar, importe, método y fecha | Abonos de cartera |
| accounts | Código, nombre, tipo, cuenta padre y marcas de sistema | Plan de cuentas |
| journalEntries | Fecha, descripción, referencia, tercero y líneas débito/crédito | Libro diario |
| attachments | Tipo y referencia del documento, nombre, MIME, tamaño y contenido | Soportes en base64/Data URL |
| saleReturns | Venta, cliente, artículos devueltos, impuestos, reembolso y estado | Devoluciones/notas crédito |
| debitNotes | Venta, concepto, base, impuesto, total y estado | Notas débito |
| measures | Nombre, símbolo, grupo y equivalencia | Unidades y conversiones |
| productionRecipes | Producto terminado, rendimiento, unidad y materiales | Fórmulas |
| productionOrders | Fórmula, producto, cantidades, materiales, bodega, costo y estado | Órdenes de producción |

### Entidades que no son tablas

En db.ts también existe una interfaz Employee (empleado), pero no se declara como tabla en la clase POSDB ni aparece en el esquema Dexie revisado. Por tanto, no documentarla como un módulo de empleados operativo. Las líneas contables permiten un tercero, pero eso tampoco implica que exista un módulo completo de recursos humanos.

## 3. Relaciones principales

Las relaciones se implementan principalmente mediante identificadores almacenados en los registros, no mediante restricciones relacionales automáticas como las de una base SQL.

- Producto → categoría mediante categoryId.
- Venta → sesión de caja mediante cashSessionId; usuario mediante userId; cliente opcional mediante customerId.
- Movimiento de caja → sesión mediante sessionId.
- Compra → proveedor mediante supplierId y bodega mediante warehouseId.
- Ítem de compra/venta → producto mediante productId.
- Pago a proveedor → compra mediante purchaseId.
- Cuenta por cobrar → venta mediante saleId y cliente mediante customerId.
- Abono de cartera → cuenta por cobrar mediante receivableId.
- Movimiento de inventario → producto y bodega mediante productId y warehouseId; puede referenciar una operación con refType/refId.
- Asiento contable → líneas incluidas en el mismo registro; cada línea identifica una cuenta por accountCode.
- Adjunto → registro relacionado mediante refType y refId.
- Devolución/nota débito → venta mediante saleId.
- Fórmula → producto terminado mediante productId y materiales mediante RecipeMaterial.productId.
- Orden de producción → fórmula, producto terminado y bodega mediante recipeId, productId y warehouseId.

La integridad de estas referencias depende de la lógica de las funciones de negocio. No asumir que IndexedDB impide borrar registros referenciados.

## 4. Índices y versiones del esquema

El constructor de POSDB define ocho versiones de esquema:

1. **Versión 1:** tablas iniciales de categorías, productos, clientes, ventas, sesiones y movimientos de caja, usuarios y ajustes.
2. **Versión 2:** agrega proveedores, bodegas, movimientos de stock, compras, pagos a proveedores, cartera, abonos, cuentas y asientos.
3. **Versión 3:** amplía índices de clientes y proveedores para ciudad, país, tipo y estado.
4. **Versión 4:** agrega adjuntos.
5. **Versión 5:** amplía índices de usuarios para correo y UID.
6. **Versión 6:** agrega updatedAt y remoteId a productos, clientes y proveedores; inicializa updatedAt en registros anteriores.
7. **Versión 7:** agrega devoluciones y notas débito.
8. **Versión 8:** agrega medidas, fórmulas y órdenes de producción.

Los índices se definen en db.ts. Para agregar o cambiar campos indexados debe crearse una nueva versión Dexie y una migración compatible; no basta con cambiar una interfaz TypeScript.

## 5. Sincronización con Firebase / Firestore

### Tablas que se sincronizan

El arreglo SYNCED_TABLES en db.ts contiene exclusivamente:

- products
- customers
- suppliers

No se sincronizan mediante este mecanismo ventas, cajas, movimientos de inventario, compras, pagos, cartera, asientos contables, adjuntos, devoluciones, notas débito ni órdenes de producción.

### Ubicación en Firestore

El servicio sync.tsx utiliza una ruta de colección con la estructura:

- erp / default / products
- erp / default / customers
- erp / default / suppliers

El identificador default está fijado en el código como espacio de empresa. No se observa aquí una separación multiempresa configurable.

### Cómo funciona

- Al crear o actualizar un registro local de una de las tres tablas, los hooks de Dexie asignan updatedAt.
- El proceso compara updatedAt con syncedAt para detectar cambios pendientes.
- Los registros se envían por lotes de hasta 300 documentos.
- Cada documento remoto utiliza remoteId; si no existe, se construye con identificador del dispositivo e ID local.
- Se descargan registros de Firestore posteriores al cursor guardado en localStorage.
- La aplicación compara updatedAt local y remoto; si el remoto es más reciente, actualiza el registro local.
- Las eliminaciones locales de esas tres tablas se representan con tombstones en localStorage y luego se publican como documentos marcados deleted.
- La sincronización se intenta al iniciar sesión, cada 60 segundos, al recuperar conexión y cuando se modifican registros de las tablas sincronizadas. También existe escucha en tiempo real con onSnapshot.

### Límites de sincronización

1. La sincronización cubre solo productos, clientes y proveedores.
2. Los datos operativos restantes permanecen locales al dispositivo y no se comparten automáticamente con otros equipos mediante este servicio.
3. La estrategia de resolución es de tipo “última modificación gana”, basada en updatedAt. No hay un flujo de conciliación manual de conflictos.
4. Los cursores, ID del dispositivo y tombstones se guardan en localStorage del navegador.
5. El identificador de empresa está fijado como default.
6. La sincronización depende de sesión Firebase y conectividad; no es una réplica completa de la base local.

## 6. Datos y archivos adjuntos

La interfaz Attachment guarda el contenido del archivo como string Data URL (base64), junto con nombre, MIME, tamaño, tipo de referencia e ID relacionado.

Las imágenes de productos también pueden almacenarse como Data URL en el campo image. Esto significa que los archivos pueden aumentar el tamaño de IndexedDB y del respaldo JSON. No se observa en el modelo Attachment un almacenamiento en Firebase Storage.

Recomendaciones operativas:
- Comprimir imágenes antes de guardarlas.
- Establecer límites de tamaño y tipos de archivo.
- Vigilar el uso de almacenamiento del navegador.
- Exportar y custodiar respaldos con acceso restringido.
- Probar restauraciones periódicamente.

## 7. Respaldo y restauración

src/lib/backup.ts exporta un JSON que contiene los datos de las tablas locales declaradas en el respaldo: medidas, fórmulas, órdenes de producción, adjuntos, categorías, productos, clientes, ventas, caja, usuarios, ajustes, proveedores, bodegas, movimientos de stock, compras, pagos, cartera, cuentas y asientos.

La importación:
- Lee y analiza el JSON.
- Abre una transacción de escritura.
- Limpia todas las tablas Dexie.
- Vuelve a insertar los conjuntos presentes en el archivo.

**Precauciones importantes:**
- La importación reemplaza la información local actual; no es una fusión.
- El respaldo no incluye los tombstones, cursores ni el identificador de dispositivo guardados en localStorage.
- No incluye los perfiles ni asignaciones almacenados en Firestore.
- Antes de restaurar, descargar una copia reciente de seguridad.
- Probar primero en un navegador o entorno separado.
- Verificar el contenido del archivo antes de importarlo.

## 8. Datos sensibles y seguridad

La configuración local AppSettings contempla credenciales de Factus (correo, contraseña, Client ID y Client Secret). En el modelo revisado esos campos forman parte de los ajustes locales y el respaldo JSON exporta la tabla settings.

Por tanto:
- Tratar el dispositivo y los archivos de respaldo como contenedores de información sensible.
- No compartir respaldos por canales públicos ni subirlos al repositorio.
- No considerar que IndexedDB cifra automáticamente estos datos.
- Revisar el flujo de uso de credenciales y el proxy Factus antes de una puesta en producción.
- Definir quién puede exportar/importar respaldos y administrar la configuración.

## 9. Archivos de implementación

- src/lib/db.ts: interfaces, tablas, índices, versiones, semillas y lista de tablas sincronizadas.
- src/lib/sync.tsx: envío, descarga, eliminación remota y estado de sincronización.
- src/lib/backup.ts: exportación e importación JSON.
- src/lib/firebase.ts: configuración de Firebase.
- src/lib/auth.tsx y src/lib/access-session.ts: autenticación y sesión de acceso.
- src/lib/erp.ts: operaciones comerciales, inventario y contabilidad.
- src/lib/production.ts: medidas, fórmulas y producción.

---
**Regla para futuras modificaciones:** cualquier nueva entidad debe documentarse aquí y en el esquema Dexie. Si debe compartirse entre dispositivos, definir explícitamente su estrategia de sincronización, reglas de conflicto, borrado y recuperación antes de incorporarla a SYNCED_TABLES.
