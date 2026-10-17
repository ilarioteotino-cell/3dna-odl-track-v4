import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://TUO_PROGETTO_SUPABASE_V4.supabase.co';
const SUPABASE_ANON_KEY = 'TUO_ANON_KEY_V4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;


