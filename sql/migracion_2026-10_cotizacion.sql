-- ============================================================================
-- MIGRACIÓN · Cotización (octubre 2026)
-- ----------------------------------------------------------------------------
-- Agrega a los ítems las columnas que trae la cotización de Pctronic:
-- referencia, marca, tiempo de entrega y observaciones.
-- NO borra nada: se puede correr sobre la base con datos reales, y correrla
-- dos veces no hace daño.
-- Cómo: Supabase → SQL Editor → pegar todo este archivo → Run.
-- ============================================================================
alter table public.presupuesto_items add column if not exists referencia text;
alter table public.presupuesto_items add column if not exists marca text;
alter table public.presupuesto_items add column if not exists tiempo_entrega text;
alter table public.presupuesto_items add column if not exists observaciones text;

-- Que la API de Supabase vea las columnas nuevas de inmediato
notify pgrst, 'reload schema';
