# Requisitos funcionales: operación láctea

## 1. Objetivo

Evolucionar Flow POS Lite, conservando sus componentes reutilizables, para gestionar la operación de una empresa que fabrica y comercializa productos lácteos propios. Este documento registra las decisiones funcionales confirmadas y sirve como base para las modificaciones técnicas.

No se contempla la venta de productos fabricados por terceros. Tampoco se incorporan nómina, gestión humana ni contratación.

## 2. Áreas incluidas

- Producción de leche líquida.
- Producción de leche en polvo.
- Calidad y laboratorio.
- Compras y abastecimiento.
- Inventarios.
- Ventas.
- Caja, operada por usuarios del área de Ventas.
- Despachos.
- Contabilidad.
- Mantenimiento.
- Servicios industriales.
- Gerencia y supervisión operativa.

## 3. Producción y fórmulas

### 3.1 Leche líquida

Cada orden de producción debe estar asociada a una fórmula específica. La fórmula define los materiales, cantidades, unidades de medida y rendimiento. La orden debe conservar una copia de la fórmula utilizada, incluso si posteriormente cambia la fórmula maestra.

### 3.2 Leche en polvo

El área maneja dos modalidades que deben distinguirse:

1. Fabricación propia de leche en polvo.
2. Compra de leche en polvo como materia prima para formular, mezclar cuando aplique y reempacar en presentaciones propias.

La leche en polvo comprada para reempaque se registra como materia prima, no como producto comercial de terceros.

### 3.3 Biblioteca de fórmulas reutilizables

- Las fórmulas se guardan en una biblioteca para reutilizarlas en múltiples órdenes.
- Cada fórmula debe identificarse y asociarse al área y producto correspondiente.
- Una fórmula puede utilizarse en varias presentaciones cuando la composición sea la misma y solo cambie el empaque.
- Los materiales de empaque y sus cantidades deben formar parte de la configuración de la presentación.
- Si cambia la composición, se crea una nueva versión; no se sobrescriben versiones utilizadas en órdenes anteriores.
- El jefe de producción es responsable de crear, modificar y aprobar fórmulas.
- Los supervisores y operarios consultan las fórmulas aprobadas según sus permisos.

## 4. Compras y abastecimiento

- Las áreas pueden solicitar insumos y materias primas.
- Compras gestiona cotizaciones, proveedores y órdenes de compra.
- La recepción verifica cantidades, condiciones y novedades.
- El inventario se actualiza con la recepción confirmada.
- Contabilidad valida los documentos de compra, cuentas por pagar y registros contables.
- Las compras cubren materias primas, ingredientes, empaques, repuestos, reactivos, suministros y otros insumos operativos.
- No se habilita la compra para reventa de productos de terceros.

## 5. Inventarios

La administración general del inventario corresponde a Contabilidad, con operación distribuida por áreas.

- Contabilidad consulta el inventario general y administra su control central, conciliaciones y ajustes autorizados.
- Cada jefe y supervisor puede consultar y operar el inventario asignado a su área según sus permisos.
- Las operaciones incluyen entradas, salidas, consumos, traslados y solicitudes de ajuste.
- Los ajustes deben conservar trazabilidad: usuario, fecha, área, motivo, cantidad anterior, diferencia, saldo y autorización cuando corresponda.
- Los movimientos históricos no se eliminan ni se sustituyen mediante ajustes.
- Debe existir trazabilidad por lote desde las materias primas hasta los productos terminados.

## 6. Ventas, caja y despachos

1. Ventas recibe y registra el pedido del cliente, con productos propios, cantidades, precios y condiciones.
2. El sistema verifica disponibilidad de producto terminado.
3. Se notifica al supervisor responsable del despacho.
4. El supervisor prepara, verifica y confirma las cantidades y lotes entregados.
5. Se registran despachos parciales, diferencias y novedades.
6. Se genera el documento de despacho y se relaciona con la venta.
7. El inventario se descuenta una sola vez por las cantidades efectivamente despachadas.
8. La facturación y el documento de despacho deben quedar relacionados, sin confundir sus funciones.

La caja es operada por usuarios de Ventas. Cada cajero mantiene su propia sesión con apertura, movimientos y cierre. Contabilidad puede consultar y conciliar la información según permisos.

**Pendiente de definición:** confirmar si el documento requerido para el despacho es interno, factura electrónica DIAN o ambos. Hasta esa definición no se debe asumir que un documento interno sustituye la factura electrónica.

## 7. Contabilidad

Contabilidad administra los registros financieros y contables, consulta ventas, compras, caja e inventarios, y realiza conciliaciones y controles. Las operaciones originadas en otras áreas deben generar trazabilidad y, cuando corresponda, sus registros contables sin permitir que usuarios operativos alteren asientos contables.

## 8. Usuarios y permisos

Los permisos se asignan por usuario, cargo, área y alcance operativo. Como mínimo deben diferenciar:

- Gerencia.
- Jefe de producción.
- Jefes de área.
- Supervisores de área.
- Operarios.
- Compras.
- Ventas y cajeros.
- Despachos.
- Contabilidad.
- Calidad.
- Inventario.

Un supervisor opera únicamente los inventarios, órdenes y despachos de las áreas que tenga asignadas, salvo autorización adicional. Las restricciones deben validarse en la lógica de negocio y en el backend; ocultar botones o rutas no constituye seguridad suficiente.

## 9. Reglas transversales

- Trazabilidad de usuario, fecha, área y documento de origen.
- Control de lotes y vencimientos cuando aplique.
- No duplicar movimientos de inventario al completar, facturar o despachar una operación.
- No alterar versiones de fórmulas ni órdenes históricas.
- Separar existencias físicas, producto en proceso y producto terminado.
- Registrar mermas, consumos reales y diferencias frente a lo planificado.
- No introducir datos ficticios ni funciones simuladas en producción.

## 10. Implementación por etapas

1. Modelo de datos y reglas de negocio: áreas, permisos, inventarios, lotes, fórmulas versionadas, presentaciones y trazabilidad.
2. Producción: adaptar las fórmulas y órdenes existentes sin perder datos.
3. Compras y recepción: solicitudes por área, órdenes de compra y recepción de insumos.
4. Inventario por áreas: almacenes, movimientos, ajustes y autorizaciones.
5. Ventas, caja y despachos: pedido, notificación, despacho, documento de entrega y control de caja por usuario.
6. Contabilidad e integración: conciliación y registros derivados.
7. Calidad, mantenimiento y servicios industriales.
8. Pruebas de migración, seguridad, concurrencia, respaldos y operación multiusuario.

## 11. Situación técnica conocida que condiciona el desarrollo

La versión revisada de Flow POS Lite utiliza Dexie/IndexedDB como almacenamiento local y Firebase Authentication/Firestore para acceso y sincronización parcial. La sincronización existente se limita a productos, clientes y proveedores. No se debe considerar que ventas, compras, movimientos de inventario u órdenes de producción ya estén sincronizados entre dispositivos.

Antes de utilizar el sistema como plataforma multiusuario empresarial, se debe diseñar y probar la persistencia compartida, la autorización en servidor, la concurrencia y la integridad transaccional. La operación local actual no debe presentarse como una solución multiusuario centralizada.
