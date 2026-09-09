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
├── dashboard.html            → panel principal (KPIs personalizables + Modo Comité de Gerencia)
├── proyectos.html            → listado de proyectos
├── proyecto-nuevo.html       → asistente de 2 pasos para crear un proyecto: (1) info general,
│                                ejecutor e impuestos (IVA/AIU) y (2) Cotización, Presupuesto de
│                                Materiales/Equipos/Alquileres, Presupuesto de Mano de Obra y
│                                Documentos — manual o importando plantilla Excel
├── proyecto-detalle.html     → detalle de un proyecto: Resumen, Cotización, Presupuesto,
│                                Ejecución (Tareas estilo Asana: Kanban + Gantt), Cortes (Obra
│                                desde la Cotización + Contratista desde la Mano de Obra, con
│                                PDF de Acta), Facturación, Compras, Documentos
├── facturacion.html          → vista global de facturas (filtro por mes, exportar Excel/PDF)
├── compras.html               → vista global de compras/costos (filtro por mes, exportar Excel/PDF)
├── suministros.html           → ventas de equipos/insumos sin instalación
├── clientes.html / contratistas.html / proveedores.html / empresas.html → catálogos
├── usuarios.html              → administración de roles (solo admins)
├── assets/js/config.js        → ⚠️ AQUÍ pones tu URL y llave de Supabase
├── assets/js/pdf.js           → generador de PDF (Acta de Corte, listados)
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

## Alcance de esta versión

Incluye: creación de Proyectos en un asistente de 2 pasos que registra
Cotización (renglonado de venta que define el valor del contrato), Presupuesto
de Materiales/Equipos/Alquileres, Presupuesto de Mano de Obra y Documentos
base — todo manual o importando la plantilla Excel de cada lista. Proyectos
(empresa propia, N° de contrato, ejecutor personal propio/contratista,
contrato IVA o AIU con IVA sobre la Utilidad, margen bruto y % de presupuesto
gastado), Ejecución con Tareas estilo Asana (Kanban + Gantt) que calculan el %
de avance automáticamente ponderando por el valor de la Cotización, Cortes de
Obra (contra la Cotización, alimenta la factura al cliente) y de Contratista
(contra el Presupuesto de Mano de Obra) con generación de Acta en PDF,
Documentos por proyecto, Facturación, Compras y Costos, Suministros, Empresas
propias (con logo), y los catálogos de Clientes, Contratistas y Proveedores
con contactos múltiples. El Panel Principal es personalizable e incluye un
Modo Comité de Gerencia para la reunión semanal de proyectos.

**Servicios y Mantenimientos** (contratos periódicos, informes
preventivo→oferta→correctivo y el sistema de tickets) queda para una
siguiente fase, según lo acordado.
