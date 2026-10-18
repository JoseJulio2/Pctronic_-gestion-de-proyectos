# Pctronic — Sistema de gestión de proyectos

App web de Pctronic Seguridad Electrónica (instalaciones CCTV, control de acceso, alarmas, cableado).
Dueño y usuario principal: Jose. **No es programador**: explica los cambios en español, simple, y avisa
siempre qué debe hacer él después (subir a GitHub, correr SQL en Supabase, etc.).

## Stack y despliegue

- Frontend: HTML + CSS + JavaScript planos. **Sin build, sin npm, sin frameworks.** Tailwind por CDN.
- Librerías por CDN: supabase-js v2, SheetJS (xlsx), jsPDF + jspdf-autotable.
- Backend: Supabase (Postgres + Auth + Storage + RLS). No hay servidor propio.
- Despliegue: push a GitHub (rama `main`) → Netlify publica solo. Supabase se actualiza a mano con
  `sql/schema.sql` en el SQL Editor.
- `assets/js/config.js` tiene la URL y la llave anon de Supabase. **NUNCA lo sobrescribas ni lo
  commitees con valores de relleno** (`TU-PROYECTO`): rompe el login. La llave `service_role` jamás va en el repo.

## Estructura

- `*.html` una página por vista; `assets/js/<pagina>.js` su lógica; `assets/js/layout.js` barra lateral,
  login obligatorio y `window.pctronicReady` (→ `{session, profile}`, `profile.rol` = `admin|miembro`).
- `assets/js/util.js` formato de moneda/fechas, `mostrarAviso`, `manejarError`, campos de moneda.
- **Proyectos** (el núcleo, en rediseño): `proyecto-nuevo.html`, `proyecto-detalle.html` y los módulos
  `assets/js/proy/*.js`, todos colgados de `window.PCT`:
  `core.js` (estado, carga, cálculos, modal) · `importar.js` (Excel v7) · `inicio.js` (datos y parámetros)
  · `presupuesto.js` · `avance.js` (avance diario) · `documentos.js`. Cada pestaña se redibuja al abrirse.
- `sql/schema.sql` esquema completo. **Hoy hace DROP + CREATE de todo** porque solo hay datos de prueba.
  Cuando haya datos reales hay que pasar a migraciones que no borren nada — avísale a Jose antes.
- `docs/PCT_Plantilla_Proyecto_v7.xlsx` plantilla de Excel que es la **especificación funcional** de Proyectos
  (hoja GUÍA APP = tablas y reglas de negocio). Léela antes de construir una fase nueva.

## Reglas de negocio (no las cambies sin hablar con Jose)

- **Valor del contrato NO se digita**: `proyectos.valor_antes_impuestos` = suma de `total_venta` de los ítems
  del presupuesto que no son adicionales (lo mantiene el trigger `recalcular_proyecto`).
- AIU: Total = CD·(1+A+I+U) + CD·U·IVA. El IVA solo recae sobre la Utilidad. Contrato IVA simple: CD·(1+IVA).
- **El avance físico real sale del Avance diario**, NO de cortes ni de dinero cobrado:
  Σ(min(cant. ejecutada, cant. contratada) × PU venta) / CD base. Lo calcula el trigger de la BD
  (`avance_porcentaje`) y `PCT.avanceFisico()` en el navegador: mantén ambos idénticos.
- **Ítems adicionales** (`es_adicional = true`): se avanzan y se cortan (cliente y contratista) pero no suman
  al CD base ni al denominador del avance.
- Cortes de cliente y de contratista se **proponen** desde lo ejecutado en el avance diario y no cortado aún
  (`v_item_ejecucion`), y el usuario los ajusta. El corte del contratista toma solo lo ejecutado por
  `ejecutor = 'contratista'`, esté pagado o no. Cortes ilimitados.
- Acta cliente: CD del corte → A, I, U, IVA sobre U → total → amortización del anticipo → neto a facturar.
- Gastos: ÚNICA fuente de todo el dinero que sale. Una fila por ítem comprado o pago; no se corrigen compras viejas.
- Retención de contratistas: persona natural declarante 4 %, no declarante 6 %, empresa 0 %.
- Crear proyectos: solo admin (validado en pantalla y con RLS `solo_admin_insert_proyectos`).

## Convenciones

- Todo el texto de la interfaz en **español** (Colombia). Moneda COP con `formatoMoneda`.
- Escapa siempre con `escapeHtml` lo que viene de la BD antes de meterlo en `innerHTML`.
- Los encabezados del Excel se buscan **por nombre**, no por posición de columna.
- Los `orden` de filas son decimales para poder insertar entre dos filas sin renumerar.
- Antes de dar algo por terminado: `node --check` a cada `.js` y probar el flujo (ver Pruebas).

## Pruebas

- Sintaxis: `for f in assets/js/*.js assets/js/proy/*.js; do node --check "$f"; done`
- Esquema: levantar un Postgres local, crear stubs de `auth.users`, `auth.uid()`, `storage.buckets`,
  `storage.objects` y el rol `authenticated`, y correr `sql/schema.sql` con `ON_ERROR_STOP=1`. Luego insertar
  datos de prueba y verificar triggers y la vista `v_item_ejecucion`.
- Interfaz: Playwright contra una página de prueba con un Supabase falso en memoria.
- Vista local rápida: `python3 -m http.server 8000` y abrir `http://localhost:8000/login.html`.

## Estado y hoja de ruta de Proyectos

Hecho (Fase 1): crear proyecto (admin + importar plantilla), Inicio (parámetros y tarifas de técnicos),
Presupuesto (tabla madre, filtros, adicionales, importar/exportar), Avance diario, Documentos, Resumen.

Pendiente, en este orden:

1. **Fase 2 — Cortes cliente** (+ Acta PDF con AIU, datos de la empresa y adjuntos; reutilizar `assets/js/pdf.js`).
2. **Fase 3 — Mano de obra** (cortes del contratista, PU contratista vs presupuesto, horas de técnicos propios)
   y **Gastos** (tabla `gastos`, factura adjunta, pago de cortes del contratista).
3. **Fase 4 — Materiales** (faltante, precio promedio, alertas), **Cronograma** (fases, hitos, predecesoras,
   Gantt, % desde avance diario) y **Tablero** (margen, avance real vs cobrado vs planeado, alertas).
4. **Fase 5** — migrar el Panel Principal, `compras.html` y `facturacion.html` a las tablas nuevas
   (hoy leen tablas heredadas: `compras`, `facturas`, `proyecto_contratistas`/`cortes_pago`).

Pendientes sueltos: el login se quedaba en "Entrando..." (probable `config.js` con valores de relleno);
las pestañas Cortes/Mano de obra/Gastos/Materiales/Cronograma aparecen como "Próximamente".

## Cómo trabajar con Jose

- Explica qué hiciste, en lenguaje de negocio, no de código. Una o dos frases por cambio.
- Si un cambio toca `sql/schema.sql`, dilo claro: "tienes que correr el SQL en Supabase".
- No agregues dependencias ni pasos de compilación. Si algo lo pide, propón una alternativa sin build.
- Pregunta antes de decisiones que cambien reglas de negocio; para el resto, decide con criterio de
  director de proyectos de obra y documéntalo aquí.
