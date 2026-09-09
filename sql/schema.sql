-- ============================================================================
-- PCTRONIC · Esquema de base de datos para Supabase (v2 — desarrollo completo)
-- ----------------------------------------------------------------------------
-- Cómo usar este archivo:
-- 1. Entra a tu proyecto de Supabase (https://supabase.com/dashboard)
-- 2. En el menú izquierdo entra a "SQL Editor"
-- 3. Pega TODO este archivo y dale click a "Run"
-- Este script BORRA y vuelve a crear todas las tablas de la app (ver sección 0).
-- Como solo tienes datos de prueba, esto es seguro. Si más adelante ya tienes
-- información real y necesitas otro cambio, avísame para preparar una
-- migración que no borre nada.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. LIMPIEZA PREVIA
-- ----------------------------------------------------------------------------
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
-- 6. PROYECTOS (empresa propia, multi-tipo, IVA o AIU)
-- ----------------------------------------------------------------------------
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  numero_contrato text,
  empresa_id uuid references public.empresas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo_proyecto text[] not null default '{}',
  estado text not null default 'sin_iniciar'
    check (estado in ('sin_iniciar','en_curso','detenido','finalizado')),
  fecha_contrato date,
  fecha_inicio date,
  fecha_fin_estimada date,

  -- Quién ejecuta el proyecto en general (informativo; cada renglón del
  -- presupuesto puede además tener su propio contratista específico).
  ejecutor_tipo text not null default 'personal_propio'
    check (ejecutor_tipo in ('personal_propio','contratista')),
  contratista_principal_id uuid references public.contratistas(id) on delete set null,

  -- Valores del contrato: o bien IVA simple, o bien AIU.
  -- En AIU, el IVA se cobra ÚNICAMENTE sobre el componente de Utilidad (regla
  -- estándar de la DIAN para contratos de obra/servicios bajo AIU).
  tipo_contrato text not null default 'iva' check (tipo_contrato in ('iva','aiu')),
  valor_antes_impuestos numeric(14,2) not null default 0,
  iva_porcentaje numeric(5,2) not null default 19,
  administracion_porcentaje numeric(5,2) not null default 0,
  imprevistos_porcentaje numeric(5,2) not null default 0,
  utilidad_porcentaje numeric(5,2) not null default 0,
  valor_total numeric(14,2) generated always as (
    case
      when tipo_contrato = 'aiu' then
        valor_antes_impuestos * (
          1 + (coalesce(administracion_porcentaje,0)
                + coalesce(imprevistos_porcentaje,0)
                + coalesce(utilidad_porcentaje,0)) / 100.0
        )
        -- + IVA solo sobre la Utilidad
        + (valor_antes_impuestos * coalesce(utilidad_porcentaje,0) / 100.0) * coalesce(iva_porcentaje,0) / 100.0
      else
        valor_antes_impuestos * (1 + coalesce(iva_porcentaje,0) / 100.0)
    end
  ) stored,

  avance_porcentaje int not null default 0 check (avance_porcentaje between 0 and 100),
  notas text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6B. COTIZACIÓN DEL PROYECTO (lado venta — la oferta con la que se contrató)
-- ----------------------------------------------------------------------------
-- Este es el renglonado con el que se ofertó el proyecto al cliente. Su suma
-- (subtotal) alimenta automáticamente `proyectos.valor_antes_impuestos`, y
-- sus cantidades son las que se usan en el "Corte de Obra" para calcular lo
-- ejecutado/pendiente y generar la factura al cliente.
create table public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  numero int,
  referencia text,
  descripcion text not null,
  cantidad numeric(14,2) not null default 1,
  unidad text default 'un',
  tiempo_entrega text,
  marca text,
  precio_unitario numeric(14,2) not null default 0,
  subtotal numeric(14,2) generated always as (cantidad * precio_unitario) stored,
  observaciones text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. PRESUPUESTO DE COSTOS (Materiales/Equipos/Alquileres y Mano de Obra)
-- ----------------------------------------------------------------------------
-- Lado costo del proyecto (lo que cuesta ejecutarlo, no lo que se cobra).
-- tipo MO = Presupuesto de Mano de Obra (alimenta el Corte de Contratista);
-- tipo MP/EQUIPO/ALQUILER/OTRO = Presupuesto de Materiales, Equipos y
-- Alquileres (referencia para comparar contra las Compras reales).
create table public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo text not null default 'MP' check (tipo in ('MP','MO','EQUIPO','ALQUILER','OTRO')),
  numero int,
  referencia text,
  descripcion text not null,
  unidad text default 'un',
  cantidad numeric(14,2) not null default 1,
  tiempo_entrega text,
  marca text,
  valor_unitario numeric(14,2) not null default 0,
  valor_total numeric(14,2) generated always as (cantidad * valor_unitario) stored,
  -- Si este renglón lo ejecuta un contratista específico, sus cantidades
  -- instaladas alimentan automáticamente el corte de pago de ese contratista.
  contratista_id uuid references public.contratistas(id) on delete set null,
  es_adicional boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. FACTURACIÓN (a los clientes)
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
-- 9. COMPRAS Y COSTOS (antes de IVA / total con IVA)
-- ----------------------------------------------------------------------------
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  categoria text not null default 'materiales'
    check (categoria in ('materiales','mano_obra','equipos','alquiler','otros')),
  descripcion text not null,
  valor_antes_iva numeric(14,2) not null default 0,
  iva_porcentaje numeric(5,2) not null default 19,
  valor numeric(14,2) generated always as (valor_antes_iva * (1 + coalesce(iva_porcentaje,0)/100.0)) stored,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. CONTRATISTAS VINCULADOS A UN PROYECTO + CORTES DE PAGO
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
-- 11. EJECUCIÓN / AVANCE DE OBRA (liga el cronograma con factura y pagos)
-- ----------------------------------------------------------------------------
-- Un "corte de ejecución" es un periodo (ej. quincena). Por cada renglón del
-- presupuesto se anota cuánto se instaló en ese periodo. Esa cantidad es la
-- que luego se usa, con un botón, para generar la factura al cliente y el
-- corte de pago del contratista correspondiente — así los tres siempre
-- concuerdan con lo realmente instalado.
create table public.ejecucion_cortes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  numero_corte int not null,
  fecha_corte date not null default current_date,
  descripcion text,
  created_at timestamptz not null default now(),
  unique (proyecto_id, numero_corte)
);

-- Cada renglón de un corte apunta O BIEN a un renglón de la Cotización
-- (item_tipo = 'cotizacion' → avance de Obra, alimenta la factura al
-- cliente) O BIEN a un renglón de Mano de Obra del presupuesto
-- (item_tipo = 'mano_obra' → avance del Contratista, alimenta su corte de
-- pago). Nunca ambos ni ninguno.
create table public.ejecucion_items (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.ejecucion_cortes(id) on delete cascade,
  item_tipo text not null default 'cotizacion' check (item_tipo in ('cotizacion','mano_obra')),
  cotizacion_item_id uuid references public.cotizacion_items(id) on delete cascade,
  presupuesto_item_id uuid references public.presupuesto_items(id) on delete cascade,
  cantidad_periodo numeric(14,2) not null default 0,
  valor_unitario_snapshot numeric(14,2) not null default 0,
  valor_periodo numeric(14,2) generated always as (cantidad_periodo * valor_unitario_snapshot) stored,
  notas text,
  created_at timestamptz not null default now(),
  constraint ejecucion_items_referencia_valida check (
    (item_tipo = 'cotizacion' and cotizacion_item_id is not null and presupuesto_item_id is null)
    or
    (item_tipo = 'mano_obra' and presupuesto_item_id is not null and cotizacion_item_id is null)
  )
);

create unique index ejecucion_items_uq_cotizacion
  on public.ejecucion_items (corte_id, cotizacion_item_id)
  where cotizacion_item_id is not null;

create unique index ejecucion_items_uq_presupuesto
  on public.ejecucion_items (corte_id, presupuesto_item_id)
  where presupuesto_item_id is not null;

-- Registro de qué se generó (factura / corte de contratista) a partir de cada
-- corte de ejecución, para no duplicar y para poder mostrar "Ya generado".
create table public.ejecucion_generaciones (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.ejecucion_cortes(id) on delete cascade,
  tipo text not null check (tipo in ('factura','corte_contratista')),
  factura_id uuid references public.facturas(id) on delete cascade,
  corte_pago_id uuid references public.cortes_pago(id) on delete cascade,
  proyecto_contratista_id uuid references public.proyecto_contratistas(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11B. DOCUMENTOS DEL PROYECTO (contratos, cotizaciones, órdenes, planos...)
-- ----------------------------------------------------------------------------
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  categoria text not null default 'otro'
    check (categoria in ('contrato','cotizacion','orden_compra','planos','polizas','acta_entrega','corte','otro')),
  nombre_archivo text not null,
  url text not null,
  subido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11C. TAREAS / EJECUCIÓN ESTILO ASANA (Kanban + Gantt)
-- ----------------------------------------------------------------------------
-- El avance del proyecto se calcula ponderando cada tarea por el valor de
-- venta del renglón de COTIZACIÓN que tenga vinculado (así el % de avance
-- refleja peso económico real frente al cliente); si no tiene cotización
-- vinculada, usa el renglón de presupuesto (costo) y si tampoco, el
-- peso_manual. Una tarea "hecha" aporta el 100% de su peso; el resto 0%.
create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cotizacion_item_id uuid references public.cotizacion_items(id) on delete set null,
  presupuesto_item_id uuid references public.presupuesto_items(id) on delete set null,
  titulo text not null,
  descripcion text,
  estado text not null default 'todo'
    check (estado in ('todo','en_progreso','revision','hecho')),
  fecha_inicio date,
  fecha_fin date,
  orden int not null default 0,
  peso_manual numeric(14,2),
  created_at timestamptz not null default now()
);

-- Recalcula el % de avance del proyecto cada vez que cambian sus tareas,
-- ponderando por el valor del renglón de presupuesto vinculado (o el peso
-- manual si no tiene renglón). No se puede hacer con una columna generada
-- porque necesita mirar varias filas de otra tabla.
create or replace function public.recalcular_avance_proyecto()
returns trigger
language plpgsql
as $$
declare
  v_proyecto_id uuid;
  v_total_peso numeric;
  v_peso_hecho numeric;
  v_nuevo_avance int;
begin
  v_proyecto_id := coalesce(new.proyecto_id, old.proyecto_id);

  select
    coalesce(sum(coalesce(ci.subtotal, pi.valor_total, t.peso_manual, 1)), 0),
    coalesce(sum(case when t.estado = 'hecho' then coalesce(ci.subtotal, pi.valor_total, t.peso_manual, 1) else 0 end), 0)
  into v_total_peso, v_peso_hecho
  from public.tareas t
  left join public.cotizacion_items ci on ci.id = t.cotizacion_item_id
  left join public.presupuesto_items pi on pi.id = t.presupuesto_item_id
  where t.proyecto_id = v_proyecto_id;

  v_nuevo_avance := case when v_total_peso > 0 then round((v_peso_hecho / v_total_peso) * 100) else 0 end;

  update public.proyectos set avance_porcentaje = v_nuevo_avance where id = v_proyecto_id;
  return null;
end;
$$;

drop trigger if exists trg_recalcular_avance on public.tareas;
create trigger trg_recalcular_avance
  after insert or update or delete on public.tareas
  for each row execute procedure public.recalcular_avance_proyecto();

-- ----------------------------------------------------------------------------
-- 11D. SUMINISTROS (ventas de equipos/insumos sin instalación, para el
-- panel de comité de gerencia)
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
-- 12. SEGURIDAD (Row Level Security)
-- ----------------------------------------------------------------------------
-- Igual que antes: cualquier usuario con cuenta creada por ti puede ver y
-- editar la información. La seguridad real está en que tú controlas quién
-- tiene usuario. Se puede afinar por rol más adelante si se necesita.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles','empresas','clientes','clientes_contactos','proveedores',
      'proveedores_contactos','contratistas','proyectos','cotizacion_items',
      'presupuesto_items','facturas','compras','proyecto_contratistas','cortes_pago',
      'ejecucion_cortes','ejecucion_items','ejecucion_generaciones',
      'documentos','tareas','suministros'
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

-- ----------------------------------------------------------------------------
-- 13. ALMACENAMIENTO (fotos de perfil)
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
-- 14. DATOS DE EJEMPLO (opcional, para probar de inmediato)
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
