# Roadmap

- [x] Autenticación con Firebase (correo + contraseña)
- [x] Segundo factor por correo (enlace de confirmación por sesión)
- [x] Perfil y rol de usuario en Firestore (`users/{uid}`), reflejado en la base local
- [x] Gestión de usuarios (invitar / activar / desactivar / rol) desde Ajustes con Firebase
- [x] Reglas de seguridad de Firestore por rol (`firestore.rules`)
- [x] Sincronizar productos, clientes y proveedores con Firestore (caché offline, conflictos por `updatedAt`, borrados propagados)
- [x] Factus: facturas, notas crédito (devoluciones/anulaciones), notas débito, rangos y catálogos
- [ ] Sincronizar ventas, compras, cartera, contabilidad y adjuntos con Firestore
- [x] Panel de producción: medidas editables, fórmulas, consumo de materiales e ingreso de terminados.
- [x] Equivalencias encadenadas entre medidas y selección flexible de unidades de producción.
- [x] Adaptar todas las vistas a computadores sin perder el uso móvil.
- [x] Verificar conversiones e inventario (6 pruebas) y formularios aislados en computador/celular.
- [ ] Revisar todas las pantallas y flujo completo con sesión Firebase real: falta sesión autorizada de prueba.
