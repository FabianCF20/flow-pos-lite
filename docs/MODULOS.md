# Módulos funcionales

> Esta guía describe las pantallas y operaciones identificadas en el código del repositorio. No equivale a una certificación de funcionamiento en producción. La aplicación utiliza almacenamiento local como fuente operativa principal; las capacidades de sincronización se describen en [ARQUITECTURA.md](./ARQUITECTURA.md).

## Perfiles y acceso observado

- **Administrador (admin):** la navegación muestra los módulos de operación, inventario, producción y finanzas.
- **Cajero (cashier):** la navegación se limita a vender, caja y tickets. AppShell redirige las rutas no permitidas a /pos.
- El control de rutas observado en AppShell.tsx es una restricción de interfaz. No debe interpretarse por sí solo como autorización segura de datos en Firestore o en el dispositivo.
- La ruta de categorías incluye además una comprobación de rol en el cliente. En las demás pantallas hay que revisar las reglas y servicios correspondientes antes de afirmar que existe autorización por operación.

## Resumen de módulos

| Módulo | Ruta | Función principal |
|---|---|---|
| Panel general | / | Indicadores de ventas, caja, cartera, compras, inventario y resultado contable |
| Punto de venta | /pos | Carrito, cobro, descuento, cliente y registro de ventas |
| Ventas / tickets | /sales | Consulta de ventas recientes, reimpresión, anulación y facturación |
| Caja | /cash | Apertura, movimientos de efectivo y cierre de sesión |
| Productos | /products | Catálogo, precios, costos, medidas, stock e imágenes |
| Categorías | /categories | Clasificación del catálogo |
| Inventario | /inventory | Existencias, bodegas, ajustes, traslados y kardex |
| Compras | /purchases | Compras, recepción y pagos a proveedores |
| Proveedores | /suppliers | Datos de proveedores nacionales y de importación |
| Clientes | /customers | Datos comerciales y tributarios de clientes |
| Producción | /production | Fórmulas, medidas y órdenes de producción |
| Contabilidad | /accounting | Resultados, balance de prueba, diario, mayor y asientos |
| Devoluciones y notas | /returns | Devoluciones, notas crédito y débito; integración Factus |
| Cartera | /receivables | Cuentas por cobrar, abonos y vencimientos |
| Reportes | /reports | Resumen de ventas, productos y medios de pago |
| Ajustes | /settings | Datos del negocio, usuarios, Factus, impresora y respaldos |
| Más | /more | Acceso agrupado a módulos y cierre de sesión |

## Descripción funcional

### 1. Panel general — /

Presenta indicadores calculados a partir de los registros locales:

- Total y cantidad de ventas completadas del día, y unidades vendidas.
- Resultado acumulado calculado a partir del balance de comprobación: ingresos menos costos y gastos.
- Cartera abierta y saldo pendiente de compras recibidas.
- Estado de la caja (abierta/cerrada).
- Cantidad de productos activos y alertas de productos con stock igual o inferior a cinco unidades.
- Accesos directos a punto de venta, contabilidad, inventario, ventas y reportes.

**Alcance:** es un tablero de consulta; los indicadores dependen de la información existente en IndexedDB y de los asientos generados.

### 2. Punto de venta — /pos

- Consulta productos activos y permite filtrar por categoría, nombre, SKU o código de barras.
- Construye un carrito con cantidades, precios unitarios y totales.
- Valida disponibilidad cuando el producto tiene control de inventario.
- Permite iniciar el cobro con método de pago, valor recibido, descuento y cliente (según el formulario de pago).
- Exige que exista una sesión de caja abierta. Para pagos distintos de crédito, valida que el valor recibido cubra el total.
- Guarda la venta localmente, descuenta existencias de productos controlados dentro de una transacción Dexie e intenta generar el asiento contable mediante postSale.
- Construye el texto del recibo y trata de imprimirlo en una impresora Bluetooth previamente emparejada.

**Importante:** el guardado de la venta no se cancela si falla el intento de contabilización automática; el código trata la contabilización como no crítica para completar la venta. La impresión también es un intento posterior, no una condición para guardar.

### 3. Ventas y tickets — /sales

- Lista las últimas 100 ventas ordenadas desde la más reciente.
- Abre el detalle de una venta.
- Permite reimprimir el recibo mediante Bluetooth.
- Incluye operación para anular una venta y restaurar existencias de los productos con control de stock.
- Incluye emisión de factura electrónica con Factus cuando la configuración está disponible.

La disponibilidad y resultado de la emisión electrónica dependen de credenciales, configuración de Factus y conectividad. La pantalla no debe confundirse con un sistema de facturación autónomo.

### 4. Caja — /cash

- Abre una sesión indicando el efectivo inicial.
- Registra ingresos y retiros de efectivo con sus conceptos.
- Muestra movimientos y ventas asociados a la sesión activa.
- Calcula el efectivo esperado a partir del monto de apertura, ventas completadas pagadas en efectivo, ingresos y retiros.
- Permite cerrar la sesión y consultar las últimas sesiones cerradas.

El efectivo esperado es un cálculo del sistema; debe compararse con el arqueo físico realizado por el responsable.

### 5. Productos — /products

- Lista y busca productos por nombre o código de barras.
- Crea y edita fichas de producto.
- Maneja categoría, precio, costo, código/SKU, código de barras, imagen, medidas y parámetros de control de existencias, según los campos del formulario.
- Permite eliminar productos.
- Requiere que exista al menos una categoría antes de crear un producto.
- Inicializa/garantiza una medida predeterminada mediante la utilidad de producción.

Antes de eliminar productos que ya tengan movimientos, debe verificarse cómo se comportan las referencias históricas en los procesos relacionados.

### 6. Categorías — /categories

- Crea, edita y elimina categorías.
- Permite asignar un color a cada categoría.
- Muestra cuántos productos están asociados a cada categoría.
- La ruta contiene una redirección en cliente para usuarios cuyo rol no sea administrador.

### 7. Inventario y bodegas — /inventory

La pantalla contiene tres vistas:

- **Existencias:** consulta productos activos, existencias y valor estimado al costo.
- **Bodegas:** consulta y administra bodegas; permite registrar una bodega y definir la predeterminada.
- **Kardex:** consulta movimientos de inventario recientes.
- Incluye operaciones de ajuste de existencias y traslado entre bodegas mediante las funciones adjustStock y transferStock.

El kardex mostrado está limitado a los últimos 200 movimientos consultados por la pantalla. El cálculo de existencias por bodega se deriva de los movimientos registrados; conviene contrastarlo con el stock general del producto y las reglas de inventario antes de usarlo como conciliación oficial.

### 8. Compras e importaciones — /purchases

- Registra compras con proveedor y detalle de productos.
- Maneja compras en estado borrador y compras recibidas.
- Permite recibir mercancía mediante receivePurchase.
- Controla el valor pagado y el saldo pendiente.
- Permite registrar pagos a proveedores mediante paySupplier.
- Presenta el saldo de compras recibidas que todavía no están pagadas por completo.
- Integra el componente de adjuntos para documentos de soporte.

La existencia de campos o etiquetas de importación no significa que exista un flujo completo de comercio exterior, nacionalización, liquidación de costos logísticos o integración aduanera.

### 9. Proveedores — /suppliers

- Crea, edita y elimina proveedores.
- Maneja identificación tributaria, nombre comercial, contacto, ubicación y datos asociados al tipo de proveedor.
- El formulario contempla proveedor nacional o de importación, moneda y datos de operación como Incoterm.

No se debe asumir que los datos del proveedor se validan automáticamente ante autoridades tributarias o sistemas externos.

### 10. Clientes — /customers

- Crea y edita fichas de clientes.
- Organiza datos de identificación, tipo de persona, nombre comercial, contacto, ubicación y condiciones de pago.
- Muestra documento, teléfono, ciudad y plazo de pago en el listado.
- Los datos del cliente pueden asociarse a una venta y a los procesos de cartera/facturación.

### 11. Producción — /production

Incluye pestañas para:

- **Órdenes:** creación y consulta de órdenes, con estados pendientes, completadas y canceladas.
- **Fórmulas:** definición y mantenimiento de recetas/consumos.
- **Medidas:** administración de unidades y medidas personalizadas.

El módulo utiliza completeProductionOrder y cancelProductionOrder para procesar órdenes. El servicio de producción gestiona conversiones de unidades y consumo de inventario. Antes de usarlo en producción real, deben probarse las fórmulas, conversiones, redondeos, bodegas y reversión de órdenes con casos reales.

### 12. Contabilidad — /accounting

La interfaz presenta:

- Estado de resultados por mes, año o histórico.
- Ingresos de ventas.
- Balance de prueba.
- Libro diario.
- Libro mayor.
- Catálogo de cuentas.
- Registro de gastos y asientos manuales.
- Adjuntos asociados a soportes contables y exportación CSV en las funciones disponibles.

El código utiliza utilidades como trialBalance, incomeStatement, salesIncome, ledger y postEntry. La documentación de este módulo no constituye una validación contable, fiscal o NIIF. Deben revisarse el PUC, la parametrización, los comprobantes automáticos y los cierres con un profesional contable en Colombia.

### 13. Devoluciones y notas — /returns

- Separa la consulta en notas crédito y notas débito.
- Permite seleccionar una venta y registrar una devolución o nota.
- Contempla devolución total o parcial, conceptos y modos de reembolso en la lógica del módulo.
- Utiliza createSaleReturn y createDebitNote.
- Permite emitir notas crédito y débito electrónicas a través de Factus cuando la integración está configurada.

Debe verificarse la correspondencia entre la devolución comercial, el movimiento de inventario, el reembolso y el documento electrónico emitido.

### 14. Cartera — /receivables

- Lista cuentas por cobrar ordenadas por vencimiento.
- Calcula el saldo pendiente de cada cuenta y el total por cobrar.
- Identifica cuentas abiertas vencidas.
- Permite abrir el detalle y registrar abonos parciales mediante payReceivable.
- Integra adjuntos en el detalle.

La cartera se alimenta de las operaciones de venta a crédito; no equivale a un módulo de cobranza con notificaciones automáticas o conciliación bancaria.

### 15. Reportes — /reports

- Resume ventas de hoy y de los últimos siete días.
- Grafica ventas por día para los últimos siete días.
- Muestra los cinco productos con mayor cantidad vendida.
- Agrupa valores por método de pago.
- Consulta ventas completadas de los últimos 30 días para mantener el cálculo acotado.

No se identifican en esta pantalla filtros avanzados por fechas arbitrarias, sucursal o usuario.

### 16. Ajustes — /settings

- Configura nombre, dirección, teléfono, identificación tributaria y pie del recibo del negocio.
- Administra usuarios del directorio mediante las funciones de usuarios.
- Configura Factus: entorno, credenciales, rango de numeración, tipo de documento e identificador de municipio; incluye prueba de autenticación.
- Permite emparejar/probar una impresora térmica Bluetooth.
- Exporta un respaldo JSON.
- Importa un respaldo JSON. La interfaz advierte que la importación reemplaza todos los datos y solicita confirmación antes de continuar.

**Precaución:** los respaldos contienen información del negocio. Deben guardarse en ubicaciones controladas y probarse periódicamente mediante restauración en un entorno seguro.

### 17. Módulos / Más — /more

Ofrece accesos a las demás pantallas. Para el cajero, la lista se reduce a tickets. También presenta acciones para cambiar de usuario y cerrar sesión.

## Límites funcionales que deben quedar claros

1. **Operación local y sincronización:** no asumir que una operación registrada en un dispositivo aparece inmediatamente en los demás. Consultar [ARQUITECTURA.md](./ARQUITECTURA.md) y el alcance real del servicio de sincronización.
2. **Autorización:** ocultar o bloquear enlaces en la interfaz no reemplaza reglas de seguridad de base de datos ni controles en servicios.
3. **Contabilidad:** los asientos automáticos y reportes deben validarse con escenarios contables reales antes de llevarlos a libros oficiales.
4. **Facturación electrónica:** depende de Factus y de su configuración; requiere pruebas en sandbox y verificación de la respuesta de la DIAN.
5. **Inventario y producción:** deben probarse ajustes, traslados, recepción de compras, devoluciones y producción para evitar diferencias de existencias.
6. **Respaldos:** exportar un archivo no garantiza por sí solo que pueda restaurarse correctamente; realizar pruebas de recuperación.
7. **Reportes:** los reportes visibles tienen límites temporales y agregaciones concretas; no representan un módulo de inteligencia de negocios completo.

## Archivos principales relacionados

- src/components/AppShell.tsx: navegación y restricción de rutas por rol.
- src/routes/: pantallas de los módulos.
- src/lib/db.ts: modelos y almacenamiento local Dexie.
- src/lib/erp.ts: operaciones comerciales, inventario y contabilidad.
- src/lib/production.ts: medidas, fórmulas y órdenes de producción.
- src/lib/factus.ts y src/routes/api/public/factus.ts: integración Factus.
- src/lib/backup.ts: exportación e importación de respaldos.
- src/lib/printer.ts y src/lib/receipt.ts: impresión y recibos.

---
**Criterio de mantenimiento:** cuando cambie una pantalla o regla de negocio, actualizar este documento después de comprobar el comportamiento en el código. Marcar como pendiente cualquier función que solo esté anunciada, pero no implementada.
