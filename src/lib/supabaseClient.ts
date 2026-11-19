import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cidyqhmqcqyxyynamdwk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_DhCrujxULt5GLsfMJKidoQ_wfhGD4vn';
export const supabase = createClient(supabaseUrl, supabaseAnonKey)