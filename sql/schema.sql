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
drop table if exists public.ejecucion_generaciones cascade;
drop table if exists public.ejecucion_items cascade;
drop table if exists public.ejecucion_cortes cascade;
drop table if exists public.cortes_pago cascade;
drop table if exists public.proyecto_contratistas cascade;
drop table if exists public.compras cascade;
drop table if exists public.facturas cascade;
drop table if exists public.presupuesto_items cascade;
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

-- ----------------------------------------------------------------------------
-- 2. EMPRESAS PROPIAS (las empresas de Jose, no clientes)
-- ----------------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  telefono text,
  email text,
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
  empresa_id uuid references public.empresas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo_proyecto text[] not null default '{}',
  estado text not null default 'sin_iniciar'
    check (estado in ('sin_iniciar','en_curso','detenido','finalizado')),
  fecha_contrato date,
  fecha_inicio date,
  fecha_fin_estimada date,

  -- Valores del contrato: o bien IVA simple, o bien AIU
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
-- 7. PRESUPUESTO (con categoría Equipos y vínculo opcional a un contratista)
-- ----------------------------------------------------------------------------
create table public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo text not null default 'MP' check (tipo in ('MP','MO','EQUIPO','ALQUILER','OTRO')),
  descripcion text not null,
  unidad text default 'un',
  cantidad numeric(14,2) not null default 1,
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
    check (categoria in ('materiales','mano_obra','equipos','otros')),
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

create table public.ejecucion_items (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.ejecucion_cortes(id) on delete cascade,
  presupuesto_item_id uuid not null references public.presupuesto_items(id) on delete cascade,
  cantidad_periodo numeric(14,2) not null default 0,
  valor_unitario_snapshot numeric(14,2) not null default 0,
  valor_periodo numeric(14,2) generated always as (cantidad_periodo * valor_unitario_snapshot) stored,
  notas text,
  created_at timestamptz not null default now(),
  unique (corte_id, presupuesto_item_id)
);

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
      'proveedores_contactos','contratistas','proyectos','presupuesto_items',
      'facturas','compras','proyecto_contratistas','cortes_pago',
      'ejecucion_cortes','ejecucion_items','ejecucion_generaciones'
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
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_authenticated_write" on storage.objects;
create policy "avatars_authenticated_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "avatars_authenticated_update" on storage.objects;
create policy "avatars_authenticated_update" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');

drop policy if exists "avatars_authenticated_delete" on storage.objects;
create policy "avatars_authenticated_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars');

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
