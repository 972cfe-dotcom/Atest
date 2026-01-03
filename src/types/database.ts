// Database types for Supabase
export interface Document {
  id: string
  user_id: string
  title: string
  content: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  updated_at?: string
}

export interface Invoice {
  id: string
  user_id: string
  supplier_name: string
  total_amount: number
  file_url: string
  status: string
  created_at: string
}

export interface User {
  id: string
  email: string
  created_at: string
}
