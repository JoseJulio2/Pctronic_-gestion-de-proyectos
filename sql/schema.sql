-- ============================================================================
-- PCTRONIC · Esquema de base de datos para Supabase (v3 — Proyectos rediseñado
-- a partir de la plantilla "PCT_Plantilla_Proyecto_v7")
-- ----------------------------------------------------------------------------
-- Cómo usar este archivo:
-- 1. Entra a tu proyecto de Supabase (https://supabase.com/dashboard)
-- 2. En el menú izquierdo entra a "SQL Editor"
-- 3. Pega TODO este archivo y dale click a "Run"
-- Este script BORRA y vuelve a crear todas las tablas de la app (ver sección 0).
-- Como solo tienes datos de prueba, esto es seguro. Si más adelante ya tienes
-- información real y necesitas otro cambio, avísame para preparar una
-- migración que no borre nada.
--
-- Mapa plantilla Excel → tablas:
--   INICIO ............ proyectos (+ parámetros) · tarifas_tecnicos
--   PRESUPUESTO ....... presupuesto_items (tabla madre). En la app se ve en dos
--                       pestañas: COTIZACIÓN (precios al cliente → valor del
--                       contrato) y PRESUPUESTO DE COSTOS (costos internos).
--   (NUEVO) AVANCE .... avance_registros (bitácora diaria) · avance_items
--   CORTES CLIENTE .... cortes_cliente · cortes_cliente_items
--   MANO DE OBRA ...... cortes_mo · cortes_mo_items · registro_mo_propia
--   GASTOS ............ gastos (única fuente de todo el dinero que sale)
--   CRONOGRAMA ........ cronograma_actividades
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. LIMPIEZA PREVIA
-- ----------------------------------------------------------------------------
drop table if exists public.cronograma_actividades cascade;
drop table if exists public.registro_mo_propia cascade;
drop table if exists public.tarifas_tecnicos cascade;
drop table if exists public.cortes_mo_items cascade;
drop table if exists public.cortes_mo cascade;
drop table if exists public.cortes_cliente_items cascade;
drop table if exists public.cortes_cliente cascade;
drop table if exists public.avance_items cascade;
drop table if exists public.avance_registros cascade;
drop table if exists public.gastos cascade;
drop table if exists public.suministros cascade;
drop table if exists public.tareas cascade;
drop table if exists public.documentos cascade;
drop table if exists public.ejecucion_generaciones cascade;
drop table if exists public.ejecucion_items cascade;
drop table if exists public.ejecucion_cortes cascade;
drop table if exists public.cortes_pago cascade;
drop table if exists public.proyecto_contratistas cascade;
drop table if exists public.compras cascade;
drop table if exists public.facturas cascade;
drop table if exists public.presupuesto_items cascade;
drop table if exists public.cotizacion_items cascade;
drop table if exists public.proyectos cascade;
drop table if exists public.clientes_contactos cascade;
drop table if exists public.proveedores_contactos cascade;
drop table if exists public.contratistas cascade;
drop table if exists public.proveedores cascade;
drop table if exists public.clientes cascade;
drop table if exists public.empresas cascade;
drop table if exists public.profiles cascade;
drop function if exists public.recalcular_avance_proyecto() cascade;
drop function if exists public.recalcular_proyecto(uuid) cascade;
drop function if exists public.trg_presupuesto_recalcular() cascade;
drop function if exists public.trg_avance_recalcular() cascade;

-- ----------------------------------------------------------------------------
-- 1. PERFILES DE USUARIO
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text,
  cargo text,
  telefono text,
  avatar_url text,
  rol text not null default 'miembro' check (rol in ('admin','miembro')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre_completo, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    'miembro'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- El trigger de arriba solo crea el perfil de usuarios NUEVOS (a partir de ahora).
-- Si ya tenías usuarios creados en Supabase antes de correr este script (por
-- ejemplo, tu propio usuario administrador), esta parte les recrea su perfil:
-- el usuario más antiguo queda como "admin" y los demás como "miembro" (lo
-- puedes ajustar después desde la pestaña "Usuarios" dentro de la app).
insert into public.profiles (id, nombre_completo, rol)
select
  u.id,
  u.email,
  case when u.id = (select id from auth.users order by created_at asc limit 1) then 'admin' else 'miembro' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ----------------------------------------------------------------------------
-- 2. EMPRESAS PROPIAS (las empresas de Jose, no clientes)
-- ----------------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  direccion text,
  telefono text,
  email text,
  logo_url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. CLIENTES + CONTACTOS
-- ----------------------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  notas text,
  created_at timestamptz not null default now()
);

create table public.clientes_contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  cargo text,
  tipo_contacto text not null default 'otro'
    check (tipo_contacto in ('contabilidad','compras','proyectos','otro')),
  telefono text,
  email text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. PROVEEDORES + CONTACTOS
-- ----------------------------------------------------------------------------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  categoria text,
  notas text,
  created_at timestamptz not null default now()
);

create table public.proveedores_contactos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  nombre text not null,
  cargo text,
  tipo_contacto text not null default 'otro'
    check (tipo_contacto in ('contabilidad','comercial','despacho_logistica','cartera','garantias','otro')),
  telefono text,
  email text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. CONTRATISTAS (con retención automática)
-- ----------------------------------------------------------------------------
-- Regla de retención (confirmada con el negocio):
--   - Persona natural, declarante de renta      -> 4%
--   - Persona natural, NO declarante de renta   -> 6%
--   - Empresa (factura con su propio AIU)       -> 0% (no aplica esta retención)
create table public.contratistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  especialidad text,
  identificacion text,
  tipo_persona text not null default 'persona_natural'
    check (tipo_persona in ('empresa','persona_natural')),
  es_declarante_renta boolean,
  telefono text,
  email text,
  porcentaje_retencion numeric(5,2) generated always as (
    case
      when tipo_persona = 'persona_natural' and coalesce(es_declarante_renta, false) then 4
      when tipo_persona = 'persona_natural' and not coalesce(es_declarante_renta, false) then 6
      else 0
    end
  ) stored,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. PROYECTOS  (hoja INICIO de la plantilla: datos + parámetros financieros)
-- ----------------------------------------------------------------------------
-- Regla AIU (confirmada con el negocio): el IVA se cobra ÚNICAMENTE sobre la
-- Utilidad. `valor_antes_impuestos` es el COSTO DIRECTO de venta y lo mantiene
-- solo la base de datos (suma de los ítems del presupuesto, sin adicionales).
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  numero_contrato text,
  empresa_id uuid references public.empresas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  ciudad text,
  numero_cotizacion text,
  fecha_cotizacion date,
  tipo_proyecto text[] not null default '{}',
  estado text not null default 'sin_iniciar'
    check (estado in ('sin_iniciar','en_curso','detenido','finalizado')),
  fecha_contrato date,
  fecha_inicio date,
  fecha_fin_estimada date,
  director_proyecto text,
  comercial_responsable text,

  -- Contratista de mano de obra del proyecto (hoja MANO DE OBRA).
  ejecutor_tipo text not null default 'personal_propio'
    check (ejecutor_tipo in ('personal_propio','contratista')),
  contratista_principal_id uuid references public.contratistas(id) on delete set null,

  -- Parámetros financieros
  tipo_contrato text not null default 'aiu' check (tipo_contrato in ('iva','aiu')),
  valor_antes_impuestos numeric(14,2) not null default 0,   -- costo directo (lo calcula un trigger)
  iva_porcentaje numeric(5,2) not null default 19,
  administracion_porcentaje numeric(5,2) not null default 0,
  imprevistos_porcentaje numeric(5,2) not null default 0,
  utilidad_porcentaje numeric(5,2) not null default 0,
  iva_materiales boolean not null default true,              -- ¿sumar IVA al costo de materiales?
  anticipo_porcentaje numeric(5,2) not null default 0,       -- se amortiza en cada acta
  anticipo_recibido numeric(14,2) not null default 0,
  impuestos_porcentaje numeric(6,3) not null default 0,      -- % sobre costo directo
  polizas_porcentaje numeric(6,3) not null default 0,        -- % sobre total contrato
  legales_porcentaje numeric(6,3) not null default 0,        -- % sobre costo directo
  recargo_hora_extra_porcentaje numeric(5,2) not null default 25,

  -- Ingreso sin IVA = CD + A + I + U  (para margen)
  valor_ingreso numeric(14,2) generated always as (
    case
      when tipo_contrato = 'aiu' then
        valor_antes_impuestos * (1 + (coalesce(administracion_porcentaje,0)
          + coalesce(imprevistos_porcentaje,0) + coalesce(utilidad_porcentaje,0)) / 100.0)
      else valor_antes_impuestos
    end
  ) stored,

  -- Total contrato: AIU → CD·(1+A+I+U) + IVA·U ;  IVA simple → CD·(1+IVA)
  valor_total numeric(14,2) generated always as (
    case
      when tipo_contrato = 'aiu' then
        valor_antes_impuestos * (
          1 + (coalesce(administracion_porcentaje,0)
                + coalesce(imprevistos_porcentaje,0)
                + coalesce(utilidad_porcentaje,0)) / 100.0
        )
        + (valor_antes_impuestos * coalesce(utilidad_porcentaje,0) / 100.0) * coalesce(iva_porcentaje,0) / 100.0
      else
        valor_antes_impuestos * (1 + coalesce(iva_porcentaje,0) / 100.0)
    end
  ) stored,

  -- AVANCE FÍSICO REAL: lo calcula la base de datos desde el Avance diario
  -- (valor ejecutado / costo directo del contrato). NO depende de cortes,
  -- facturas ni pagos.
  avance_porcentaje int not null default 0 check (avance_porcentaje between 0 and 100),
  notas text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Tarifas de los técnicos propios (hoja INICIO, tabla "TARIFAS TÉCNICOS PROPIOS")
create table public.tarifas_tecnicos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cargo text not null,
  valor_hora numeric(14,2) not null default 0,
  horas_dia numeric(5,2) not null default 8,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. COTIZACIÓN + PRESUPUESTO DE COSTOS (tabla madre del proyecto)
-- ----------------------------------------------------------------------------
-- Una sola tabla con capítulos, subcapítulos e ítems. Cada ÍTEM trae el precio
-- unitario de la cotización (lo que se cobra al cliente; de aquí sale el valor
-- del contrato) y los costos unitarios internos por tipo
-- (material, mano de obra, transporte, alquiler) → margen por ítem.
-- `es_adicional` marca ítems que salen en obra y NO estaban en el contrato:
-- se pueden avanzar y cortar (cliente y contratista) igual que los demás, pero
-- no suman al valor base del contrato ni al denominador del avance físico.
create table public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo text not null default 'item' check (tipo in ('capitulo','subcapitulo','item')),
  orden double precision not null default 0,   -- decimal: permite insertar entre dos filas sin renumerar
  codigo text,                                  -- columna "Ítem" / "#" (1, 1.1, 2.3 ...)
  referencia text,                              -- referencia del equipo (ej. GST-M200)
  descripcion text not null,
  marca text,
  unidad text default 'un',
  cantidad numeric(14,2) not null default 0,
  tiempo_entrega text,                          -- ej. "10 días"
  observaciones text,
  pu_venta numeric(14,2) not null default 0,    -- precio unitario de la cotización al cliente
  cu_material numeric(14,2) not null default 0,       -- sin IVA
  cu_mano_obra numeric(14,2) not null default 0,
  cu_transporte numeric(14,2) not null default 0,
  concepto_alquiler text,
  cu_alquiler numeric(14,2) not null default 0,
  pu_contratista numeric(14,2),                        -- precio pactado con el contratista (null = sin asignar)
  cant_inicial_comprada numeric(14,2) not null default 0, -- comprado ANTES de usar Gastos
  es_adicional boolean not null default false,
  total_venta numeric(14,2) generated always as (
    case when tipo = 'item' then cantidad * pu_venta else 0 end
  ) stored,
  created_at timestamptz not null default now()
);
create index presupuesto_items_proyecto_idx on public.presupuesto_items (proyecto_id, orden);

-- Recalcula costo directo y avance físico del proyecto.
create or replace function public.recalcular_proyecto(p_proyecto uuid)
returns void
language plpgsql
as $$
declare
  v_cd numeric;
  v_base numeric;
  v_ejec numeric;
begin
  select coalesce(sum(total_venta), 0) into v_cd
  from public.presupuesto_items
  where proyecto_id = p_proyecto and tipo = 'item' and not es_adicional;

  -- valor ejecutado (tope = cantidad contratada de cada ítem) sobre el CD base
  select coalesce(sum(least(coalesce(e.cant, 0), i.cantidad) * i.pu_venta), 0)
  into v_ejec
  from public.presupuesto_items i
  left join (
    select presupuesto_item_id, sum(cantidad) as cant
    from public.avance_items
    where proyecto_id = p_proyecto
    group by presupuesto_item_id
  ) e on e.presupuesto_item_id = i.id
  where i.proyecto_id = p_proyecto and i.tipo = 'item' and not i.es_adicional;

  update public.proyectos
  set valor_antes_impuestos = v_cd,
      avance_porcentaje = case when v_cd > 0 then least(100, round(v_ejec / v_cd * 100)) else 0 end
  where id = p_proyecto;
end;
$$;

create or replace function public.trg_recalcular_proyecto()
returns trigger
language plpgsql
as $$
begin
  if (tg_op in ('UPDATE','INSERT')) then
    perform public.recalcular_proyecto(new.proyecto_id);
  end if;
  if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.proyecto_id is distinct from new.proyecto_id)) then
    perform public.recalcular_proyecto(old.proyecto_id);
  end if;
  return null;
end;
$$;

create trigger trg_presupuesto_recalcular
  after insert or update or delete on public.presupuesto_items
  for each row execute procedure public.trg_recalcular_proyecto();

-- ----------------------------------------------------------------------------
-- 8. FACTURACIÓN (a los clientes) — vista global, se mantiene para el Panel
-- ----------------------------------------------------------------------------
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  numero_factura text,
  valor numeric(14,2) not null default 0,
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','pagada','vencida','anulada')),
  notas text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. COMPRAS (heredada) — la reemplaza GASTOS; se conserva para que la vista
-- global y el Panel sigan funcionando hasta migrarlos en la fase de Gastos.
-- ----------------------------------------------------------------------------
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  categoria text not null default 'materiales'
    check (categoria in ('materiales','mano_obra','equipos','alquiler','otros')),
  descripcion text not null,
  presupuesto_item_id uuid references public.presupuesto_items(id) on delete set null,
  numero_factura text,
  factura_url text,
  valor_antes_iva numeric(14,2) not null default 0,
  iva_porcentaje numeric(5,2) not null default 19,
  valor numeric(14,2) generated always as (valor_antes_iva * (1 + coalesce(iva_porcentaje,0)/100.0)) stored,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. CONTRATISTAS VINCULADOS + CORTES DE PAGO (heredados, solo para el Panel)
-- ----------------------------------------------------------------------------
create table public.proyecto_contratistas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  contratista_id uuid not null references public.contratistas(id) on delete cascade,
  valor_contratado numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (proyecto_id, contratista_id)
);

create table public.cortes_pago (
  id uuid primary key default gen_random_uuid(),
  proyecto_contratista_id uuid not null references public.proyecto_contratistas(id) on delete cascade,
  periodo_inicio date,
  periodo_fin date,
  valor_bruto numeric(14,2) not null default 0,
  retenciones numeric(14,2) not null default 0,
  valor_neto numeric(14,2) generated always as (valor_bruto - retenciones) stored,
  estado text not null default 'en_tramite' check (estado in ('borrador','en_tramite','pagado')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11. AVANCE DIARIO (pestaña nueva — fuente del AVANCE FÍSICO REAL)
-- ----------------------------------------------------------------------------
-- Una bitácora por día y proyecto (clima, observaciones, novedades) y, debajo,
-- las cantidades ejecutadas ese día por ítem del presupuesto, indicando quién
-- las ejecutó (contratista o personal propio). Los ítems adicionales también
-- se avanzan aquí. De esta tabla salen: el % de avance del proyecto, lo que
-- queda pendiente por cortar al cliente y lo que se le debe cortar al
-- contratista.
create table public.avance_registros (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fecha date not null default current_date,
  clima text,
  observaciones text,
  novedades text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (proyecto_id, fecha)
);

create table public.avance_items (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.avance_registros(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  presupuesto_item_id uuid not null references public.presupuesto_items(id) on delete cascade,
  cantidad numeric(14,2) not null default 0,
  ejecutor text not null default 'contratista' check (ejecutor in ('contratista','propio')),
  notas text,
  created_at timestamptz not null default now()
);
create index avance_items_item_idx on public.avance_items (presupuesto_item_id);
create index avance_items_proyecto_idx on public.avance_items (proyecto_id);

create trigger trg_avance_recalcular
  after insert or update or delete on public.avance_items
  for each row execute procedure public.trg_recalcular_proyecto();

-- ----------------------------------------------------------------------------
-- 12. CORTES DE CLIENTE (hoja CORTES CLIENTE: acta de cobro)
-- ----------------------------------------------------------------------------
-- La cantidad cortada de cada ítem se propone desde lo ejecutado en el Avance
-- diario que aún no se ha cortado, pero se puede ajustar. Los cortes son
-- ilimitados (la plantilla de Excel tenía 6 columnas fijas).
create table public.cortes_cliente (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  numero int not null,
  fecha date not null default current_date,
  estado text not null default 'pendiente' check (estado in ('pendiente','facturado','pagado')),
  numero_factura text,
  fecha_factura date,
  valor_recaudado numeric(14,2) not null default 0,
  notas text,
  created_at timestamptz not null default now(),
  unique (proyecto_id, numero)
);

create table public.cortes_cliente_items (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.cortes_cliente(id) on delete cascade,
  presupuesto_item_id uuid not null references public.presupuesto_items(id) on delete cascade,
  cantidad numeric(14,2) not null default 0,
  pu_venta_snapshot numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (corte_id, presupuesto_item_id)
);

-- ----------------------------------------------------------------------------
-- 13. MANO DE OBRA (hoja MANO DE OBRA): cortes del contratista + técnicos propios
-- ----------------------------------------------------------------------------
-- El corte del contratista toma lo que el Avance diario marcó como ejecutado
-- por él ('contratista') y aún no se le ha cortado — esté pagado o no.
create table public.cortes_mo (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  numero int not null,
  fecha date not null default current_date,
  numero_cuenta_cobro text,
  contratista_id uuid references public.contratistas(id) on delete set null,
  retencion_porcentaje numeric(5,2) not null default 0, -- % de retención del contratista al momento del corte
  notas text,
  created_at timestamptz not null default now(),
  unique (proyecto_id, numero)
);

create table public.cortes_mo_items (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.cortes_mo(id) on delete cascade,
  presupuesto_item_id uuid not null references public.presupuesto_items(id) on delete cascade,
  cantidad numeric(14,2) not null default 0,
  pu_contratista_snapshot numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (corte_id, presupuesto_item_id)
);

-- Una fila por técnico propio y día. Valor = valor_hora · (días·horas_día + extra·(1+recargo)).
create table public.registro_mo_propia (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fecha date not null default current_date,
  tecnico text not null,
  tarifa_id uuid references public.tarifas_tecnicos(id) on delete set null,
  presupuesto_item_id uuid references public.presupuesto_items(id) on delete set null,
  dias numeric(6,2) not null default 1,
  horas_dia numeric(5,2),
  horas_extra numeric(6,2) not null default 0,
  observaciones text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 14. GASTOS (hoja GASTOS: ÚNICA fuente de todo el dinero que sale)
-- ----------------------------------------------------------------------------
-- Una fila por ítem comprado o por pago, con su precio real. No se corrigen
-- compras viejas. `categoria` se deduce del tipo.
create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null default 'Material'
    check (tipo in ('Material','Equipo','Suministro','Alquiler','Transporte','Mano de obra contratista')),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  proveedor_texto text,
  documento text,                                     -- N° factura / OC
  factura_url text,                                   -- archivo de la factura
  presupuesto_item_id uuid references public.presupuesto_items(id) on delete set null,
  corte_mo_id uuid references public.cortes_mo(id) on delete set null, -- pago de un corte del contratista
  descripcion text,
  cantidad numeric(14,2),
  valor_unitario numeric(14,2) not null default 0,
  valor_total numeric(14,2) generated always as (coalesce(cantidad, 1) * valor_unitario) stored,
  observaciones text,
  categoria text generated always as (
    case
      when tipo in ('Material','Equipo','Suministro') then 'Materiales y equipos'
      when tipo = 'Mano de obra contratista' then 'Mano de obra contratista'
      when tipo = 'Transporte' then 'Transporte y otros'
      else 'Alquileres'
    end
  ) stored,
  created_at timestamptz not null default now()
);
create index gastos_proyecto_idx on public.gastos (proyecto_id, fecha);

-- ----------------------------------------------------------------------------
-- 15. CRONOGRAMA (hoja CRONOGRAMA: fases, hitos, actividades, Gantt)
-- ----------------------------------------------------------------------------
-- Las fechas (inicio / fin) se calculan en la app: real › inicio fijo › fin de
-- la predecesora + 1 › inicio del proyecto. El % de las actividades de
-- instalación sale del Avance diario del capítulo vinculado.
create table public.cronograma_actividades (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  orden double precision not null default 0,
  tipo text not null default 'gestion'
    check (tipo in ('fase','hito','gestion','compra','instalacion','pruebas')),
  nombre text not null,
  responsable text,
  frente_item_id uuid references public.presupuesto_items(id) on delete set null, -- capítulo vinculado
  predecesora_id uuid references public.cronograma_actividades(id) on delete set null,
  inicio_fijo date,
  dias int not null default 1,
  inicio_real date,
  fin_real date,
  pct_manual numeric(5,2) check (pct_manual between 0 and 100),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 16. DOCUMENTOS DEL PROYECTO (contratos, planos, soportes de cortes...)
-- ----------------------------------------------------------------------------
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  categoria text not null default 'otro'
    check (categoria in ('contrato','cotizacion','orden_compra','planos','polizas','acta_entrega','corte','otro')),
  corte_id uuid references public.cortes_cliente(id) on delete cascade,
  nombre_archivo text not null,
  url text not null,
  subido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 17. SUMINISTROS (ventas de equipos/insumos sin instalación)
-- ----------------------------------------------------------------------------
create table public.suministros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  oferta text,
  fecha_notificacion date,
  fecha_recibo_insumos date,
  fecha_cierre date,
  valor_venta numeric(14,2) not null default 0,
  iva_incluido boolean not null default true,
  estado text not null default 'en_curso'
    check (estado in ('en_curso','cerrado','cancelado')),
  notas text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 18. VISTA DE EJECUCIÓN POR ÍTEM (lo que usan Avance, Cortes y Cronograma)
-- ----------------------------------------------------------------------------
create or replace view public.v_item_ejecucion
with (security_invoker = true) as
select
  i.id as presupuesto_item_id,
  i.proyecto_id,
  coalesce(a.total, 0)       as cant_ejecutada,
  coalesce(a.contratista, 0) as cant_ejecutada_contratista,
  coalesce(a.propio, 0)      as cant_ejecutada_propio,
  coalesce(c.total, 0)       as cant_cortada_cliente,
  coalesce(m.total, 0)       as cant_cortada_mo,
  coalesce(a.total, 0) - coalesce(c.total, 0)       as pendiente_cortar_cliente,
  coalesce(a.contratista, 0) - coalesce(m.total, 0) as pendiente_cortar_mo
from public.presupuesto_items i
left join (
  select presupuesto_item_id,
         sum(cantidad) as total,
         sum(cantidad) filter (where ejecutor = 'contratista') as contratista,
         sum(cantidad) filter (where ejecutor = 'propio') as propio
  from public.avance_items group by presupuesto_item_id
) a on a.presupuesto_item_id = i.id
left join (
  select presupuesto_item_id, sum(cantidad) as total
  from public.cortes_cliente_items group by presupuesto_item_id
) c on c.presupuesto_item_id = i.id
left join (
  select presupuesto_item_id, sum(cantidad) as total
  from public.cortes_mo_items group by presupuesto_item_id
) m on m.presupuesto_item_id = i.id
where i.tipo = 'item';

-- ----------------------------------------------------------------------------
-- 19. SEGURIDAD (Row Level Security)
-- ----------------------------------------------------------------------------
-- Cualquier usuario con cuenta creada por ti puede ver y editar la información.
-- La seguridad real está en que tú controlas quién tiene usuario.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles','empresas','clientes','clientes_contactos','proveedores',
      'proveedores_contactos','contratistas','proyectos','tarifas_tecnicos',
      'presupuesto_items','facturas','compras','proyecto_contratistas','cortes_pago',
      'avance_registros','avance_items','cortes_cliente','cortes_cliente_items',
      'cortes_mo','cortes_mo_items','registro_mo_propia','gastos',
      'cronograma_actividades','documentos','suministros'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "authenticated_select" on public.%I;', t);
    execute format('create policy "authenticated_select" on public.%I for select to authenticated using (true);', t);

    execute format('drop policy if exists "authenticated_insert" on public.%I;', t);
    execute format('create policy "authenticated_insert" on public.%I for insert to authenticated with check (true);', t);

    execute format('drop policy if exists "authenticated_update" on public.%I;', t);
    execute format('create policy "authenticated_update" on public.%I for update to authenticated using (true) with check (true);', t);

    execute format('drop policy if exists "authenticated_delete" on public.%I;', t);
    execute format('create policy "authenticated_delete" on public.%I for delete to authenticated using (true);', t);
  end loop;
end $$;

-- Crear proyectos nuevos es una acción exclusiva del administrador.
drop policy if exists "authenticated_insert" on public.proyectos;
create policy "solo_admin_insert_proyectos" on public.proyectos
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

-- ----------------------------------------------------------------------------
-- 20. ALMACENAMIENTO (fotos de perfil)
-- ----------------------------------------------------------------------------
-- 'avatars' = fotos de perfil, 'logos' = logos de tus empresas (para los PDF),
-- 'documentos' = archivos adjuntos de cada proyecto (contratos, planos, etc).
-- Los tres son públicos para simplificar (igual que el resto de la app, la
-- seguridad real es que solo tu equipo tiene usuario).
do $$
declare
  b text;
begin
  for b in select unnest(array['avatars','logos','documentos'])
  loop
    insert into storage.buckets (id, name, public)
    values (b, b, true)
    on conflict (id) do nothing;

    execute format('drop policy if exists "%s_public_read" on storage.objects;', b);
    execute format('create policy "%s_public_read" on storage.objects for select using (bucket_id = %L);', b, b);

    execute format('drop policy if exists "%s_authenticated_write" on storage.objects;', b);
    execute format('create policy "%s_authenticated_write" on storage.objects for insert to authenticated with check (bucket_id = %L);', b, b);

    execute format('drop policy if exists "%s_authenticated_update" on storage.objects;', b);
    execute format('create policy "%s_authenticated_update" on storage.objects for update to authenticated using (bucket_id = %L);', b, b);

    execute format('drop policy if exists "%s_authenticated_delete" on storage.objects;', b);
    execute format('create policy "%s_authenticated_delete" on storage.objects for delete to authenticated using (bucket_id = %L);', b, b);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 21. DATOS DE EJEMPLO (opcional, para probar de inmediato)
-- ----------------------------------------------------------------------------
insert into public.empresas (nombre, nit)
select 'Pctronic Seguridad Electrónica SAS', '900123456-7'
where not exists (select 1 from public.empresas where nombre = 'Pctronic Seguridad Electrónica SAS');

insert into public.clientes (nombre, nit)
select 'Hospital San Rafael', '800111222-3'
where not exists (select 1 from public.clientes where nombre = 'Hospital San Rafael');

insert into public.contratistas (nombre, especialidad, tipo_persona, es_declarante_renta, telefono)
select 'Juan Pérez', 'Líder Cuadrilla Eléctrica', 'persona_natural', true, '3009876543'
where not exists (select 1 from public.contratistas where nombre = 'Juan Pérez');

insert into public.proveedores (nombre, categoria, nit)
select 'Dahua Distribuciones', 'Cámaras y CCTV', '900555666-1'
where not exists (select 1 from public.proveedores where nombre = 'Dahua Distribuciones');
