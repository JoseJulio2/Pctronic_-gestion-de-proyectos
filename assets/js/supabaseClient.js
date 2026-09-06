// ============================================================================
// Crea el cliente de Supabase que todas las páginas usan para leer/guardar
// datos. No necesitas tocar este archivo.
// ============================================================================

(function () {
  const cfg = window.PCTRONIC_CONFIG || {};

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("TU-PROYECTO")) {
    console.warn(
      "[Pctronic] Falta configurar Supabase en assets/js/config.js (SUPABASE_URL / SUPABASE_ANON_KEY)."
    );
  }

  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
})();
