import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Strict validation — fail fast if env vars are missing
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_project_url') {
    const errorMsg = "CRITICAL: Supabase credentials missing or invalid in .env file. " +
        "Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
    console.error(errorMsg);
    throw new Error(errorMsg);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
