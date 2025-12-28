# Supabase Setup Instructions

This document provides step-by-step instructions to set up Supabase for the SaaS Document Processor application.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)

## Step 1: Create a New Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in the project details:
   - Name: `document-processor` (or your preferred name)
   - Database Password: Choose a strong password (save this!)
   - Region: Select closest to your users
4. Click "Create new project" and wait for it to initialize (~2 minutes)

## Step 2: Get Your API Credentials

1. In your Supabase project dashboard, click "Settings" in the sidebar
2. Click "API" under Project Settings
3. Copy the following values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## Step 3: Configure Environment Variables

1. Open the `.dev.vars` file in your project root
2. Replace the placeholder values with your actual credentials:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key-here
```

## Step 4: Create the Database Schema

1. In your Supabase dashboard, click "SQL Editor" in the sidebar
2. Click "New query"
3. Copy and paste the following SQL:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own documents
CREATE POLICY "Users can view their own documents"
  ON documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own documents
CREATE POLICY "Users can insert their own documents"
  ON documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own documents
CREATE POLICY "Users can update their own documents"
  ON documents
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own documents
CREATE POLICY "Users can delete their own documents"
  ON documents
  FOR DELETE
  USING (auth.uid() = user_id);
```

4. Click "Run" to execute the SQL
5. You should see "Success. No rows returned" message

## Step 5: Configure Authentication

1. In your Supabase dashboard, click "Authentication" in the sidebar
2. Click "Providers"
3. Ensure "Email" is enabled (it should be by default)
4. Optional: Configure email templates under "Email Templates"

## Step 6: Verify Setup

1. In the SQL Editor, run this query to verify the table was created:

```sql
SELECT * FROM documents;
```

You should see an empty result set (no errors).

## Step 7: Test the Application

1. Start your development server:
```bash
npm run build
pm2 start ecosystem.config.cjs
```

2. Open the application in your browser
3. Try signing up with a test email
4. Upload a test document
5. Click "Process OCR" to test the backend functionality

## Troubleshooting

### "Supabase credentials not configured" Error

- Verify that `.dev.vars` has the correct values
- Restart your development server after updating `.dev.vars`

### "Document not found" Error

- Check that the documents table was created correctly
- Verify RLS policies are in place

### Authentication Issues

- Ensure email provider is enabled in Supabase Authentication settings
- Check browser console for detailed error messages

## Production Deployment

For production deployment to Cloudflare Pages:

1. Set environment variables in Cloudflare Pages dashboard:
```bash
wrangler pages secret put SUPABASE_URL
wrangler pages secret put SUPABASE_ANON_KEY
```

2. Or set them in the Cloudflare Pages dashboard:
   - Go to your project settings
   - Navigate to "Environment variables"
   - Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`

## Security Notes

- **Never commit** `.dev.vars` to version control
- The anon key is safe to expose in client-side code (it's public)
- Row Level Security (RLS) ensures users can only access their own data
- Always use HTTPS in production
