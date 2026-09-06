-- ============================================================================
-- PCTRONIC · Esquema de base de datos para Supabase
-- ----------------------------------------------------------------------------
-- Cómo usar este archivo:
-- 1. Entra a tu proyecto de Supabase (https://supabase.com/dashboard)
-- 2. En el menú izquierdo entra a "SQL Editor"
-- 3. Pega TODO este archivo y dale click a "Run"
-- Eso crea todas las tablas, seguridad y automatizaciones que la app necesita.
-- Es seguro volver a correrlo si algo falla (usa "if not exists" donde aplica).
-- ============================================================================

-- Extensión necesaria para generar IDs únicos (uuid)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. LIMPIEZA PREVIA (seguro en un proyecto nuevo sin datos reales)
-- ----------------------------------------------------------------------------
-- Si alguna de estas tablas ya existía en tu proyecto (por ejemplo, creada a
-- mano desde el "Table Editor" con un id tipo bigint, o de un intento
-- anterior), la borramos primero para evitar choques de tipos de datos.
-- Si ya guardaste información real en alguna de estas tablas, AVISA antes de
-- correr esto porque se perdería.
drop table if exists public.cortes_pago cascade;
drop table if exists public.proyecto_contratistas cascade;
drop table if exists public.compras cascade;
drop table if exists public.facturas cascade;
drop table if exists public.presupuesto_items cascade;
drop table if exists public.proyectos cascade;
drop table if exists public.contratistas cascade;
drop table if exists public.proveedores cascade;
drop table if exists public.clientes cascade;
drop table if exists public.profiles cascade;

-- ----------------------------------------------------------------------------
-- 1. PERFILES DE USUARIO (empleados que usan el sistema)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text,
  rol text not null default 'miembro' check (rol in ('admin','miembro')),
  created_at timestamptz not null default now()
);

-- Cuando se crea un usuario nuevo en Supabase Auth, se le crea automáticamente
-- su fila en "profiles" para que aparezca en la app.
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
-- 2. CATÁLOGOS DE APOYO
-- ----------------------------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  contacto_telefono text,
  contacto_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.contratistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  especialidad text,
  telefono text,
  email text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. PROYECTOS
-- ----------------------------------------------------------------------------
create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo_proyecto text,
  estado text not null default 'sin_iniciar'
    check (estado in ('sin_iniciar','en_curso','detenido','finalizado')),
  fecha_contrato date,
  fecha_inicio date,
  fecha_fin_estimada date,
  valor_total numeric(14,2) not null default 0,
  avance_porcentaje int not null default 0
    check (avance_porcentaje between 0 and 100),
  notas text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Renglones del presupuesto (materiales / mano de obra / otros)
create table if not exists public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo text not null default 'MP' check (tipo in ('MP','MO','OTRO')),
  descripcion text not null,
  cantidad numeric(12,2) not null default 1,
  valor_unitario numeric(14,2) not null default 0,
  valor_total numeric(14,2) generated always as (cantidad * valor_unitario) stored,
  created_at timestamptz not null default now()
);

-- Facturación / ingresos por proyecto
create table if not exists public.facturas (
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

-- Compras y costos por proyecto
create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  categoria text not null default 'materiales'
    check (categoria in ('materiales','mano_obra','otros')),
  descripcion text not null,
  valor numeric(14,2) not null default 0,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

-- Contratistas vinculados a un proyecto
create table if not exists public.proyecto_contratistas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  contratista_id uuid not null references public.contratistas(id) on delete cascade,
  valor_contratado numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (proyecto_id, contratista_id)
);

-- Cortes / actas de pago a contratistas
create table if not exists public.cortes_pago (
  id uuid primary key default gen_random_uuid(),
  proyecto_contratista_id uuid not null references public.proyecto_contratistas(id) on delete cascade,
  periodo_inicio date,
  periodo_fin date,
  valor_bruto numeric(14,2) not null default 0,
  retenciones numeric(14,2) not null default 0,
  valor_neto numeric(14,2) generated always as (valor_bruto - retenciones) stored,
  estado text not null default 'en_tramite'
    check (estado in ('borrador','en_tramite','pagado')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. SEGURIDAD (Row Level Security)
-- ----------------------------------------------------------------------------
-- Regla simple para esta primera versión: cualquier persona con una cuenta
-- creada por ti (usuario autenticado) puede ver y editar la información.
-- Es decir, la seguridad "de verdad" está en que TÚ controlas quién tiene
-- usuario y contraseña (los creas uno por uno desde Supabase). Más adelante
-- se pueden agregar reglas más finas por rol si se necesita.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles','clientes','proveedores','contratistas','proyectos',
      'presupuesto_items','facturas','compras','proyecto_contratistas','cortes_pago'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "authenticated_select" on public.%I;', t);
    execute format(
      'create policy "authenticated_select" on public.%I for select to authenticated using (true);',
      t
    );

    execute format('drop policy if exists "authenticated_insert" on public.%I;', t);
    execute format(
      'create policy "authenticated_insert" on public.%I for insert to authenticated with check (true);',
      t
    );

    execute format('drop policy if exists "authenticated_update" on public.%I;', t);
    execute format(
      'create policy "authenticated_update" on public.%I for update to authenticated using (true) with check (true);',
      t
    );

    execute format('drop policy if exists "authenticated_delete" on public.%I;', t);
    execute format(
      'create policy "authenticated_delete" on public.%I for delete to authenticated using (true);',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5. DATOS DE EJEMPLO (opcional, solo para probar la app de inmediato)
-- ----------------------------------------------------------------------------
-- Si NO quieres datos de ejemplo, borra o comenta este bloque antes de correr
-- el script. Si ya lo corriste una vez, puedes correrlo de nuevo sin problema
-- (usa "where not exists" para no duplicar).

insert into public.clientes (nombre, contacto_nombre, contacto_telefono, contacto_email)
select 'Hospital San Rafael', 'María Gómez', '3001234567', 'compras@hospitalsanrafael.example'
where not exists (select 1 from public.clientes where nombre = 'Hospital San Rafael');

insert into public.contratistas (nombre, especialidad, telefono)
select 'Juan Pérez', 'Líder Cuadrilla Eléctrica', '3009876543'
where not exists (select 1 from public.contratistas where nombre = 'Juan Pérez');

insert into public.proveedores (nombre, categoria, contacto_telefono)
select 'Dahua Distribuciones', 'Cámaras y CCTV', '3011122334'
where not exists (select 1 from public.proveedores where nombre = 'Dahua Distribuciones');
