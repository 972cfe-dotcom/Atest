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
  // Hardcoded credentials for Cloudflare deployment
  const supabaseUrl = 'https://dmnxblcdaqnenggfyurw.supabase.co'
  const supabaseAnonKey = 'sb_publishable_B5zKNJ_dI1254sPk4Yt0hQ_p-3qdaRe'

  return createClient(supabaseUrl, supabaseAnonKey)
}
