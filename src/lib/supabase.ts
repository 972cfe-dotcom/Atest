import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client (browser)
export function createSupabaseClient() {
  const supabaseUrl = (window as any).__SUPABASE_URL__ || ''
  const supabaseAnonKey = (window as any).__SUPABASE_ANON_KEY__ || ''
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials')
    throw new Error('Supabase credentials not configured')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

// Server-side Supabase client (Cloudflare Workers)
export function createServerSupabaseClient(env: any) {
  const supabaseUrl = env.SUPABASE_URL
  const supabaseAnonKey = env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables not configured')
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}
