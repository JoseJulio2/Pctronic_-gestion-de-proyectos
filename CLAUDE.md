# Pctronic — Sistema de gestión de proyectos

App web de Pctronic Seguridad Electrónica (instalaciones CCTV, control de acceso, alarmas, cableado).
Dueño y usuario principal: Jose. **No es programador**: explica los cambios en español, simple, y avisa
siempre qué debe hacer él después (subir a GitHub, correr SQL en Supabase, etc.).

## Stack y despliegue

- Frontend: HTML + CSS + JavaScript planos. **Sin build, sin npm, sin frameworks.** Tailwind por CDN.
- Librerías por CDN: supabase-js v2, SheetJS (xlsx), jsPDF + jspdf-autotable. ExcelJS 4.4.0 + JSZip 3.10.1
  se cargan **solo al exportar** (`PCT.cargarExcelJS`), porque SheetJS gratis no conserva formato ni logo.
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
  `core.js` (estado, carga, cálculos, modal) · `importar.js` (Excel: cotización de Pctronic y plantilla v7,
  + plantilla de cotización descargable) · `inicio.js` (datos y parámetros) · `presupuesto.js` (pestañas
  **Cotización** y **Presupuesto de costos**) · `avance.js` (avance diario) · `cortes.js` (Cortes cliente +
  `PCT.editorCorte` y `PCT.pdfActa`, compartidos) · `manoobra.js` (contrato y cortes del contratista, pagos,
  técnicos propios) · `gastos.js` (Gastos) · `documentos.js`.
  Cada pestaña se redibuja al abrirse.
- **Nombres**: en pantalla se dice **Cotización** (precios al cliente) y **Presupuesto de costos** (costos
  internos). Nunca "Presupuesto" a secas para lo que paga el cliente. En la BD sigue siendo una sola tabla
  `presupuesto_items` (no se renombró para no romper nada).
- `sql/schema.sql` esquema completo. **Hace DROP + CREATE de todo** (solo para montar una base desde cero).
  Los cambios nuevos van además en `sql/migracion_*.sql` que no borran nada (`add column if not exists`);
  a Jose se le pide correr solo la migración.
- `docs/PCT_Plantilla_Proyecto_v7.xlsx` plantilla de Excel que es la **especificación funcional** de Proyectos
  (hoja GUÍA APP = tablas y reglas de negocio). Léela antes de construir una fase nueva. Su hoja PRESUPUESTO
  equivale en la app a Cotización + Presupuesto de costos.
- **Formato real de la cotización de Pctronic** (hoja "Cotizador"): encabezado (Referencia, Descripción = nombre
  del proyecto, Fecha, Validez, Cliente, Ciudad, Atención, Correo, Teléfono, Cotización No.), ítems con columnas
  `# · REFERENCIA · DESCRIPCIÓN · CANT. · UNIDAD · TIEMPO DE ENTREGA · MARCA · Precio Unitario · Subtotal ·
  Observaciones`, agrupados por secciones (Suministro, Instalación → capítulos), y abajo dos totales sobre el
  mismo subtotal: "TOTAL OFERTA SUMINISTROS" (IVA pleno) y "TOTAL OFERTA AIU INSTALACION" (A, I, U, IVA sobre U).
  Trae solo precios de venta, no costos. Al importarla en Nuevo proyecto se pregunta con cuál oferta aceptó el
  cliente (`tipo_contrato` = `aiu` | `iva`). Puede traer filas `#REF!`: se ignoran.
  El cotizador completo (ej. Mapei) trae además, a la derecha de la columna J, columnas internas de costo
  (Costo, Moneda, Ref Fabricante, Descripcion, **Tipo**, Margen, TRM...): la tabla se corta en la primera
  columna vacía después de "Descripción" para no mezclarlas. Títulos de sección: uno solo → capítulo; dos
  seguidos → capítulo + subcapítulo (y los siguientes sueltos, subcapítulos). Si el IVA pleno dice
  "Incluido", solo hay esquema AIU y no se pregunta.
- `docs/Plantilla_Cotizacion_Pctronic.xlsx` es **el mismo Excel de cotización de Pctronic, copiado tal cual**
  (logo, colores, fórmulas). El botón "Descargar plantilla" baja ese archivo; no lo generes con SheetJS (la
  versión gratuita no copia formato ni imágenes). Si Jose cambia su formato, reemplaza ese archivo.
- **Exportar** (Cotización y Presupuesto de costos) llena esa misma plantilla con ExcelJS
  (`PCT.exportarCotizacionExcel`): encabezado, ítems con capítulos (franja azul), % AIU/IVA del proyecto y
  sumas que cubren toda el área de ítems. Si no caben, inserta filas y corre a mano celdas combinadas y
  fórmulas de abajo (ExcelJS no lo hace). Calcula los resultados de las fórmulas (vista previa de celular) y
  corrige el tamaño del logo con JSZip (ExcelJS lo deja en 0). La versión de costos agrega a la derecha de
  Observaciones: C.U. material (sin IVA), C.U. material (con IVA), Costo total, Margen $ y Margen % (verde/rojo);
  **Importar costos** lee esa plantilla y solo actualiza `cu_material`, cruzando por # + descripción.

## Reglas de negocio (no las cambies sin hablar con Jose)

- **Presupuesto de costos = solo material/equipos** (Jose, oct. 2026): sin mano de obra (Fase 3), transporte
  ni alquiler (salen de Gastos). `PCT.calcItem` usa costo = cantidad × C.U. material (con IVA si
  `iva_materiales`). Margen positivo en verde, negativo en rojo. Las columnas `cu_mano_obra`, `cu_transporte`,
  `cu_alquiler`, `pu_contratista` siguen en la BD sin usarse aquí.
- **El valor del contrato sale de la Cotización** (confirmado con Jose, oct. 2026): `proyectos.valor_antes_impuestos`
  = Σ cantidad × precio unitario (`pu_venta`) de los ítems de la cotización que no son adicionales (lo mantiene
  el trigger `recalcular_proyecto`). No se digita aparte. Los costos (Presupuesto de costos) NO afectan el contrato.
- AIU: Total = CD·(1+A+I+U) + CD·U·IVA. El IVA solo recae sobre la Utilidad. Contrato IVA pleno: CD·(1+IVA).
- El descuento de la cotización todavía no se aplica (se avisa al importar).
- **El avance físico real sale del Avance diario**, NO de cortes ni de dinero cobrado:
  Σ(min(cant. ejecutada, cant. contratada) × PU venta) / CD base. Lo calcula el trigger de la BD
  (`avance_porcentaje`) y `PCT.avanceFisico()` en el navegador: mantén ambos idénticos.
- **Ítems adicionales** (`es_adicional = true`): se avanzan y se cortan (cliente y contratista) pero no suman
  al CD base ni al denominador del avance.
- Cortes de cliente y de contratista se **proponen** desde lo ejecutado en el avance diario y no cortado aún
  (`v_item_ejecucion`), y el usuario los ajusta. El corte del contratista toma solo lo ejecutado por
  `ejecutor = 'contratista'`, esté pagado o no. Cortes ilimitados.
- Acta cliente: CD del corte → A, I, U, IVA sobre U → total → amortización del anticipo → neto a facturar.
- **Margen bruto actual** (encabezado del proyecto, al lado del avance real) = facturado − gastado.
  Facturado = ingreso sin IVA de los cortes de cliente en estado **facturado o pagado** (Σ cantidad ×
  `pu_venta_snapshot`, con A+I+U si es AIU; un corte "pendiente" no cuenta); gastado = Σ `gastos.valor_total`.
  `PCT.recargarFinanzas` + `PCT.margenActual`.
- **Cortes** (cliente y contratista): `PCT.editorCorte` propone por ítem lo ejecutado en el Avance diario y
  no cortado (`v_item_ejecucion`); el usuario ajusta (puede cortar más que lo pendiente). El precio queda
  congelado en el corte (`pu_venta_snapshot` / `pu_contratista_snapshot`). Solo se puede eliminar el último
  corte. Soportes del corte cliente = `documentos` con `corte_id` (salen listados en el acta PDF).
- **Mano de obra**: PU MO presupuesto (`cu_mano_obra`) y PU contratista (`pu_contratista`) se editan en la
  pestaña Mano de obra (ya no en Presupuesto de costos); ahorro solo en ítems con PU contratista. El corte del
  contratista guarda `contratista_id` y `retencion_porcentaje` (snapshot). **Pagos al contratista = filas en
  `gastos`** (tipo 'Mano de obra contratista', `corte_mo_id`) por el valor BRUTO (costo real); el neto girado
  y la retención quedan en `observaciones`. Saldo del corte = bruto − pagado. Técnicos propios
  (`registro_mo_propia`): valor = valor_hora × (días × horas_día + extra × (1 + recargo)); no van a Gastos.
- **Avance diario** (Jose, oct. 2026): bitácora = un solo comentario por día (`avance_registros.observaciones`;
  el clima ya no se usa y las novedades viejas se muestran unidas al comentario). Tabla "Avance por ítem" con
  TODOS los ítems: este día, acumulado y % editables; cualquier cambio se guarda como la cantidad del día
  elegido en `avance_items` (línea del ejecutor elegido; puede ser negativa para corregir, el acumulado nunca
  < 0). El peso de cada ítem (valor/CD) es interno: **no mostrar valores en esa tabla**. Se conservan la curva
  de avance real, el avance por capítulo y los días registrados.
- Gastos: ÚNICA fuente de todo el dinero que sale. Una fila por ítem comprado o pago; no se corrigen compras viejas.
  Pestaña **Gastos** = registro GENERAL por gasto o factura (Jose, oct. 2026; NO ítem por ítem): fecha, tipo
  (Material, Equipo, Suministro, Alquiler, Transporte; "Mano de obra contratista" solo la crea Mano de obra y aquí
  es de solo lectura), proveedor (si coincide con `proveedores` se liga `proveedor_id`, si no `proveedor_texto`),
  N° de factura (opcional: también se pagan cosas sin factura), concepto, valor total, observaciones y soporte
  opcional (bucket `documentos`, ruta `<proyecto>/gastos/`). Se agrega/edita con un formulario. En la BD:
  `documento` = N° factura, `descripcion` = concepto, `valor_unitario` = valor, `cantidad` = null,
  `presupuesto_item_id` = null. El detalle de compras por ítem vendrá del **módulo de Compras**, que se
  conectará con el proyecto más adelante. Exportar/importar Excel (entiende también la hoja GASTOS de la v7).
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

Hecho (Fase 1): crear proyecto (admin + importar la cotización de Pctronic tal cual o la plantilla v7,
escoger esquema AIU / IVA pleno, descargar su mismo Excel de cotización), Inicio (parámetros y tarifas de técnicos),
Cotización (ítems con referencia, marca, tiempo de entrega, observaciones; adicionales; importar/exportar),
Presupuesto de costos (solo material, margen verde/rojo, exportar/importar en la plantilla de cotización),
Avance diario (con bitácora diaria: tabla `avance_registros`), Documentos, Resumen.

Hecho (Fase 2, oct. 2026): **Cortes cliente** (acta con AIU y anticipo, factura/estado/recaudo, soportes, PDF)
y **Mano de obra** (contrato del contratista, cortes con retención y PDF, pagos que crean gastos, técnicos
propios). Migración: `sql/migracion_2026-10_fase2.sql`. `assets/js/pdf.js` es heredado (solo se usa su
`imagenABase64` para el logo).

Hecho (Fase 3, oct. 2026): **Gastos** (sin migración: la tabla `gastos` ya existía).

Pendiente, en este orden:

3. **Fase 4 — Materiales** (faltante, precio promedio, alertas), **Cronograma** (fases, hitos, predecesoras,
   Gantt, % desde avance diario) y **Tablero** (margen, avance real vs cobrado vs planeado, alertas).
4. **Fase 5** — migrar el Panel Principal, `compras.html` y `facturacion.html` a las tablas nuevas
   (hoy leen tablas heredadas: `compras`, `facturas`, `proyecto_contratistas`/`cortes_pago`).

Pendientes sueltos: las pestañas Materiales/Cronograma aparecen como "Próximamente".

## Cómo trabajar con Jose

- Explica qué hiciste, en lenguaje de negocio, no de código. Una o dos frases por cambio.
- Si un cambio toca `sql/schema.sql`, dilo claro: "tienes que correr el SQL en Supabase".
- No agregues dependencias ni pasos de compilación. Si algo lo pide, propón una alternativa sin build.
- Pregunta antes de decisiones que cambien reglas de negocio; para el resto, decide con criterio de
  director de proyectos de obra y documéntalo aquí.
