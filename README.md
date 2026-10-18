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
├── proyecto-nuevo.html       → crear un proyecto (solo administradores): datos, parámetros (AIU, IVA,
│                                anticipo, impuestos, pólizas) y opción de importar la plantilla de Excel v7
├── proyecto-detalle.html     → detalle de un proyecto, por pestañas (cada una en assets/js/proy/):
│                                Resumen · Inicio · Presupuesto (tabla madre, filtro por categoría,
│                                ítems adicionales) · Avance diario (cantidades por ítem, bitácora, avance
│                                físico real) · Documentos. Próximas fases: Cortes cliente, Mano de obra,
│                                Gastos, Materiales y Cronograma.
├── facturacion.html          → vista global de facturas (filtro por mes, exportar Excel/PDF)
├── compras.html               → vista global de compras/costos (filtro por mes, exportar Excel/PDF)
├── suministros.html           → ventas de equipos/insumos sin instalación
├── clientes.html / contratistas.html / proveedores.html / empresas.html → catálogos
├── usuarios.html              → administración de roles (solo admins)
├── assets/js/config.js        → ⚠️ AQUÍ pones tu URL y llave de Supabase
├── assets/js/proy/*.js        → módulos de Proyectos (core, inicio, presupuesto, avance, documentos, importar)
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
- Excepción ya aplicada: **crear un proyecto nuevo es una acción exclusiva del
  administrador** — el botón "Nuevo Proyecto" solo aparece para admins, y la
  base de datos también lo exige con una política de seguridad (aunque alguien
  intente saltarse la pantalla, Supabase rechaza el insert si su usuario no
  tiene rol `admin` en `profiles`).

## Alcance de esta versión

**Proyectos se está rediseñando a partir de la plantilla de Excel `PCT_Plantilla_Proyecto_v7`.**
Ya están listas la Fase 1 (Inicio, Presupuesto, Avance diario, Documentos); faltan por construir
Cortes cliente, Mano de obra, Gastos, Materiales, Cronograma y Tablero.

Reglas de negocio clave:

- **El valor del contrato no se digita**: sale de la suma de los ítems del Presupuesto (costo directo de
  venta) más AIU e IVA sobre la utilidad.
- **El avance físico real sale del Avance diario**, no de los cortes ni del dinero cobrado: valor
  ejecutado (cantidad × precio de venta, con tope en lo contratado) dividido por el costo directo del contrato.
- **Ítems adicionales**: trabajo que sale en obra fuera del contrato. Se avanzan y se cortan (cliente y
  contratista) como cualquier ítem, pero no cambian el valor base del contrato ni el denominador del avance.
- El avance diario indica quién ejecutó (contratista o personal propio): el corte del contratista toma solo
  lo que ejecutó él y aún no se le ha cortado, esté pagado o no.

Se conservan, sin cambios, el Panel Principal, Facturación y Compras globales (que pasarán a leer de
Gastos en la Fase 3), Suministros, Empresas, Clientes, Contratistas y Proveedores.

**Servicios y Mantenimientos** (contratos periódicos, informes
preventivo→oferta→correctivo y el sistema de tickets) queda para una
siguiente fase, según lo acordado.
