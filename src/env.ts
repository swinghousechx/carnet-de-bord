// Variables injectées au build. Toutes publiques par nature (clé publishable Supabase
// protégée par RLS, clé Google restreinte par référent) : aucun secret ici.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '') || undefined,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined,
  mapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY?.trim() || undefined,
}
