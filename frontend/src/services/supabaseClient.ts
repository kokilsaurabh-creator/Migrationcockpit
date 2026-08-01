// frontend/src/services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://yleoqalxncxbwkfefqcp.supabase.co';
const supabaseKey = env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZW9xYWx4bmN4YndrZmVmcWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3ODk1OTAsImV4cCI6MjA5OTM2NTU5MH0.LJ9owRPNy_BLM4E0M5Kc_hZMZMBhZU9tjEEkAefZar4';

export const supabase = createClient(supabaseUrl, supabaseKey);
