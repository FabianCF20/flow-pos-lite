# Arquitectura de sincronización multiusuario

## Estado

Arquitectura objetivo: **cloud-first y centralizada**. Diseño pendiente de implementación y pruebas. La sincronización actual del código continúa limitada a productos, clientes y proveedores; el sistema todavía no opera de forma centralizada.

## 1. Objetivo

Todos los equipos autorizados deben consultar y modificar información compartida de la misma empresa. Los cambios deben propagarse en tiempo real o con la menor latencia posible, con persistencia central, control de concurrencia, permisos por área y trazabilidad.

Firestore será la única fuente oficial de datos operativos. La aplicación web no debe crear ni confirmar operaciones de negocio en una base IndexedDB local. Dexie/IndexedDB se retirará del flujo operativo; durante la migración solo podrá utilizarse un importador temporal para rescatar datos existentes. No se habilitará persistencia offline de escrituras. Las pantallas podrán mantener estado temporal en memoria, pero toda lectura y escritura oficial deberá pasar por Firestore o por servicios de backend confiables.

## 2. Tablas y entidades que requieren sincronización

La cobertura debe incluir, después de definir el tratamiento de cada entidad:

- Catálogos: categorías, productos, clientes, proveedores, medidas, bodegas y cuentas contables.
- Operación comercial: ventas, devoluciones, notas débito, cartera y recaudos.
- Caja: sesiones y movimientos de caja.
- Compras: órdenes/recepciones de compra y pagos a proveedores.
- Inventario: movimientos, traslados, ajustes y saldos derivados.
- Producción: fórmulas, versiones, órdenes, consumos y resultados.
- Contabilidad: comprobantes y líneas contables.
- Adjuntos: metadatos y archivos; los archivos binarios deben evaluarse para Firebase Storage, no duplicarse como base64 en documentos Firestore.
- Configuración de empresa y almacenes.

Los usuarios, asignaciones de acceso y roles deben continuar bajo el modelo de identidad y seguridad de Firebase, no sincronizarse como tablas operativas locales sin controles.

## 3. Identidad estable y relaciones

El esquema actual utiliza claves autoincrementales locales de Dexie. Esas claves no son seguras como identidad compartida: dos dispositivos pueden crear, por ejemplo, la venta local #25 para operaciones distintas.

Antes de sincronizar todas las tablas:

1. Introducir un identificador global e inmutable (UUID) por entidad.
2. Mantener temporalmente el ID numérico local solo como clave de caché y compatibilidad.
3. Migrar las relaciones para referenciar identificadores globales, o mantener un mapa explícito y validado de ID local a ID remoto.
4. Usar identificadores globales también para órdenes, movimientos, comprobantes y operaciones idempotentes.
5. Definir consecutivos visibles mediante asignación central transaccional; no generar consecutivos empresariales con contadores locales.

No se debe ampliar simplemente la lista SYNCED_TABLES mientras las relaciones sigan dependiendo de IDs autoincrementales locales.

## 4. Escrituras y consistencia

Las operaciones de negocio críticas deben ejecutarse mediante servicios que escriban en Firestore con transacciones o lotes atómicos y validación del estado actual del servidor.

Ejemplos:
- Confirmar una recepción de compra: registrar recepción, movimiento de inventario y referencia contable sin duplicados.
- Completar una orden de producción: validar insumos, registrar consumos, producción obtenida, lotes y movimientos relacionados en una operación consistente.
- Confirmar un despacho: validar disponibilidad, registrar cantidades y lotes entregados, descontar inventario y actualizar estado del pedido una sola vez.
- Cerrar caja: impedir cierres concurrentes o duplicados y conservar diferencias.

Cada comando crítico debe tener un operationId/idempotency key para que reintentos de red no dupliquen movimientos ni comprobantes.

Las operaciones no deben depender de que el cliente envíe una copia completa del saldo. El servidor debe validar y actualizar los datos necesarios dentro de una transacción. Deben respetarse límites de transacciones y lotes de Firestore.

## 5. Lecturas en tiempo real y recuperación

- Escuchar cambios de documentos/consultas por empresa y permisos.
- No mantener una base local de negocio. Usar únicamente estado temporal de interfaz y caché controlada que no permita confirmar operaciones offline.
- Registrar estado de sincronización, último éxito y errores recuperables.
- Recuperar cambios tras reconexión sin depender únicamente de cursores de milisegundos.
- Usar paginación y cursores estables; manejar eliminaciones mediante tombstones.
- Reconciliar datos después de una interrupción y ofrecer un proceso de verificación.
- Evitar listeners globales de colecciones grandes; suscribirse por área, almacén, estado o rango según permisos y necesidad.

## 6. Conflictos y concurrencia

La estrategia actual de “gana el updatedAt más reciente” no es suficiente para inventarios, caja, ventas, compras ni contabilidad.

- Los catálogos editables pueden usar control de versión y detección de conflicto.
- Los movimientos de inventario son registros inmutables; corregir mediante un nuevo ajuste/reversión, nunca sobrescribir el movimiento histórico.
- Los estados de pedidos, órdenes y despachos deben cambiar mediante transiciones válidas en servidor.
- Fórmulas aprobadas y versiones usadas en producción deben conservarse como snapshots inmutables.
- Los asientos contables confirmados deben corregirse mediante reversión y nuevo asiento, no edición silenciosa.
- Las cajas abiertas y cierres requieren exclusión/validación transaccional.

## 7. Seguridad

Las reglas actuales permiten a cualquier usuario autenticado crear y actualizar cualquier documento de `erp/{company}/{collection}`. Esto no es suficiente para el modelo por áreas.

La implementación debe validar en servidor:
- empresa y pertenencia del usuario;
- asignación activa;
- rol y permisos para la colección/acción;
- alcance de área, bodega o centro de producción;
- transiciones permitidas y campos que puede modificar.

No se debe confiar en permisos de interfaz, filtros del cliente ni datos de rol enviados por el navegador. Las reglas Firestore deben aplicar denegación por defecto. Para operaciones que requieren lógica compleja o privilegios, usar backend confiable (por ejemplo Cloud Functions/servicio servidor) con validación de autorización.

## 8. Adjuntos

Los metadatos y relaciones pueden sincronizarse en Firestore; los binarios deben almacenarse en Firebase Storage o servicio equivalente, con reglas de acceso y referencias seguras. Deben definirse límites de tamaño, tipos permitidos, retención y copias de seguridad.

## 9. Plan de implementación y pruebas

1. Definir empresa/tenant, áreas, almacenes, roles y permisos de servidor.
2. Diseñar UUID, referencias globales y migración de datos locales existentes.
3. Implementar repositorios cloud-first: Firestore/backend como fuente oficial, sin repositorio Dexie operativo; separar lecturas de escrituras críticas.
4. Implementar primero catálogos y maestros.
5. Implementar inventario mediante libro de movimientos inmutables.
6. Implementar compras/recepciones, producción/consumos, ventas/despachos, caja y contabilidad con operaciones idempotentes.
7. Implementar listeners acotados, recuperación, tombstones y observabilidad.
8. Migrar adjuntos a almacenamiento de archivos.
9. Ejecutar pruebas con varios usuarios y dispositivos: creación simultánea, edición concurrente, desconexión, reintentos, duplicados, permisos cruzados, pérdida de conexión, cierre de caja y movimientos de inventario concurrentes.
10. Hacer conciliación de datos y respaldo antes de activar la operación real.

## 10. Criterios de aceptación

- Dos o más usuarios autorizados ven el mismo estado de la empresa.
- Una operación confirmada en un dispositivo aparece en los demás sin exportaciones manuales.
- No hay duplicación de ventas, pagos, movimientos, consumos, despachos ni asientos por reintentos.
- No se pierden registros por IDs locales coincidentes.
- No se sobrescriben movimientos históricos por conflictos de sincronización.
- Los usuarios no pueden leer ni modificar áreas fuera de su alcance.
- Las operaciones críticas se mantienen consistentes bajo concurrencia.
- La aplicación informa claramente si una operación fue confirmada por el servidor o falló; no presenta como guardada una operación solo almacenada en el navegador.
- Las pruebas de restauración y reconciliación son satisfactorias.

## 11. Riesgos actuales que deben corregirse

La implementación existente:
- mantiene una base Dexie local y sincroniza solo productos, clientes y proveedores;
- genera IDs remotos basados en dispositivo e ID local;
- utiliza `updatedAt` y una política de “última escritura gana”;
- guarda cursores en `localStorage`;
- no sincroniza ventas, caja, compras, movimientos, contabilidad ni producción;
- usa reglas Firestore demasiado amplias para un ERP por áreas.

Por estos motivos, no es seguro afirmar que el sistema es multiusuario ni que basta con añadir más tablas a la lista actual.


## 12. Decisión cloud-first

El objetivo del proyecto cambia de sincronización de bases locales a operación centralizada:

- Firestore/backend es la única fuente oficial de verdad para todos los módulos.
- No se crean ventas, compras, movimientos, cierres, órdenes ni asientos como operaciones locales pendientes de sincronización.
- No se habilita escritura offline ni una cola local de operaciones críticas.
- La interfaz requiere conexión para consultar y guardar operaciones. Si se pierde la conexión, debe bloquear las acciones que escriben y mostrar un mensaje claro.
- Los datos temporales de formularios pueden permanecer en memoria mientras la pantalla esté abierta, pero no se consideran registros guardados.
- Los datos ya existentes en IndexedDB se rescatarán mediante una migración/importación controlada, con conciliación, antes de retirar Dexie.
- El código puede seguir ejecutándose en un servidor de desarrollo local durante programación; eso no significa que los datos operativos se guarden localmente.

La eliminación de Dexie será progresiva: primero se migrarán servicios y pantallas a repositorios remotos, después se migrarán los datos históricos y finalmente se retirarán las dependencias, hooks y tablas locales. No se debe borrar la base local antes de verificar la migración y respaldar los datos existentes.
