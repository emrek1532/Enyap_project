import { createClient } from '@supabase/supabase-js';

// Publishable (anon) anahtar istemci tarafında kullanılmak üzere tasarlanmıştır;
// veri güvenliği veritabanındaki RLS politikaları ile sağlanır.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aaduhhdwemnyqhnttcat.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_r-RVHM4n_fEKQ5pX-L_kvQ_Cg2CDu5r';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
