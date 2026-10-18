-- ============================================================================
-- MIGRACIÓN · Fase 2: cortes de cliente y mano de obra (octubre 2026)
-- ----------------------------------------------------------------------------
-- Los cortes del contratista guardan a qué contratista se le cortó y el % de
-- retención que tenía en ese momento (persona natural declarante 4 %, no
-- declarante 6 %, empresa 0 %), para que el corte no cambie si después se
-- edita el contratista.
-- NO borra nada: se puede correr sobre la base con datos reales, y correrla
-- dos veces no hace daño.
-- Cómo: Supabase → SQL Editor → pegar todo este archivo → Run.
-- ============================================================================
alter table public.cortes_mo
  add column if not exists contratista_id uuid references public.contratistas(id) on delete set null;
alter table public.cortes_mo
  add column if not exists retencion_porcentaje numeric(5,2) not null default 0;

-- Que la API de Supabase vea las columnas nuevas de inmediato
notify pgrst, 'reload schema';
