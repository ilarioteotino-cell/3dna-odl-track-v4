import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zwywgxurmufmbchxkfik.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3eXdneHVybXVmbWJjaHhrZmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNjg3MjcsImV4cCI6MjEwNzg0NDcyN30.sM8fMSbdFyd4Y1JDEWGX7WhjEQM0ZP9bPYTc8wTnOJE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;

