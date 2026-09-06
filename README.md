# Pctronic — Sistema de Gestión de Proyectos

Esta carpeta contiene una aplicación web **lista para publicar**, sin necesidad de
instalar nada ni "compilar" código. Son archivos HTML, CSS y JavaScript planos
que funcionan en cualquier hosting de páginas estáticas (Netlify, Vercel,
Cloudflare Pages, GitHub Pages, etc.) y usan [Supabase](https://supabase.com)
como base de datos y sistema de usuarios.

**Antes de publicarla, sigue la guía paso a paso "Guía de Despliegue —
Pctronic.pdf / .html"** que te entregué junto con este código. Ahí está
explicado todo, sin dar por hecho que sabes de programación.

## Estructura

```
├── index.html              → redirige a login o al panel según la sesión
├── login.html               → inicio de sesión
├── dashboard.html            → panel principal (KPIs)
├── proyectos.html            → listado de proyectos
├── proyecto-nuevo.html       → formulario para crear un proyecto
├── proyecto-detalle.html     → detalle de un proyecto (presupuesto, facturación, compras, contratistas)
├── facturacion.html          → vista global de facturas de todos los proyectos
├── compras.html               → vista global de compras/costos de todos los proyectos
├── clientes.html / contratistas.html / proveedores.html → catálogos
├── usuarios.html              → administración de roles (solo admins)
├── assets/js/config.js        → ⚠️ AQUÍ pones tu URL y llave de Supabase
├── assets/js/*.js             → lógica de cada página
├── assets/css/styles.css      → estilos pequeños
└── sql/schema.sql             → script para crear la base de datos en Supabase
```

## Lo único que tienes que editar

`assets/js/config.js` — pega ahí la URL y la llave "anon public" de tu proyecto
de Supabase. Todo lo demás ya está listo.

## Cómo se ve la seguridad

- El acceso a la aplicación requiere iniciar sesión (Supabase Auth).
- Tú creas cada usuario manualmente desde el panel de Supabase
  (Authentication → Users → Add user) — así controlas exactamente quién entra.
- Dentro de la base de datos, cualquier persona con sesión iniciada puede leer
  y escribir la información (pensado para un equipo interno de confianza). Si
  más adelante quieres restringir por rol a nivel de base de datos, se puede
  ajustar el archivo `sql/schema.sql`.

## Alcance de esta primera versión

Incluye: Proyectos (presupuesto, contratistas y sus cortes de pago),
Facturación, Compras y Costos, y los catálogos de Clientes, Contratistas y
Proveedores. Inventario y Reportes quedan para una siguiente fase.
