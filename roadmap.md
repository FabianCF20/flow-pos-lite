# Roadmap

- [x] Autenticación con Firebase (correo + contraseña)
- [x] Segundo factor por correo (enlace de confirmación por sesión)
- [x] Perfil y rol de usuario en Firestore (`users/{uid}`), reflejado en la base local
- [x] Gestión de usuarios (invitar / activar / desactivar / rol) desde Ajustes con Firebase
- [x] Reglas de seguridad de Firestore por rol (`firestore.rules`)
- [x] Sincronizar productos, clientes y proveedores con Firestore (caché offline, conflictos por `updatedAt`, borrados propagados)
- [ ] Sincronizar ventas, compras, cartera, contabilidad y adjuntos con Firestore
