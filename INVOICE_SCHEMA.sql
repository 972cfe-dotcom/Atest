-- ============================================
-- Invoice Processing Workflow - Database Schema
-- ============================================

-- 1. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_name ON invoices(supplier_name);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies

-- Users can view their own invoices
CREATE POLICY "Users can view their own invoices"
  ON invoices
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own invoices
CREATE POLICY "Users can insert their own invoices"
  ON invoices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own invoices
CREATE POLICY "Users can update their own invoices"
  ON invoices
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own invoices
CREATE POLICY "Users can delete their own invoices"
  ON invoices
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Supabase Storage Setup (Manual Steps)
-- ============================================

-- IMPORTANT: You need to create a storage bucket in Supabase dashboard:
-- 1. Go to Storage in Supabase dashboard
-- 2. Click "Create a new bucket"
-- 3. Name: "invoices"
-- 4. Public: Yes (or No if you want private files)
-- 5. Click "Create bucket"

-- If you want public access to files, create this policy in Storage:
-- Bucket: invoices
-- Policy name: "Public read access"
-- Allowed operations: SELECT
-- Policy definition: true

-- For authenticated users to upload:
-- Policy name: "Authenticated users can upload"
-- Allowed operations: INSERT
-- Policy definition: auth.uid() IS NOT NULL

-- ============================================
-- Verification Queries
-- ============================================

-- Check if table was created
SELECT * FROM invoices LIMIT 1;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'invoices';

-- Check RLS is enabled
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'invoices';

-- Check policies
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'invoices';

-- ============================================
-- Sample Data for Testing (Optional)
-- ============================================

-- Insert a test invoice (replace 'YOUR_USER_ID' with actual user ID)
-- INSERT INTO invoices (user_id, supplier_name, total_amount, file_url, status)
-- VALUES (
--   'YOUR_USER_ID',
--   'Test Supplier Inc.',
--   1234.56,
--   'https://example.com/invoice.pdf',
--   'processed'
-- );
