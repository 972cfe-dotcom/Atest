# Quick Start Guide

## 🎯 What You Need to Do Now

The application is **ready to run** but needs **Supabase credentials** to work fully.

### Step 1: Create Supabase Project (5 minutes)

1. Go to https://app.supabase.com
2. Click "New Project"
3. Name: `document-processor` (or any name)
4. Wait 2 minutes for project to initialize

### Step 2: Get Your Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: starts with `eyJ...`

### Step 3: Configure Environment Variables

Edit `.dev.vars` file in the project root:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key-here
```

### Step 4: Create Database Schema

1. In Supabase dashboard, click **SQL Editor**
2. Copy this SQL and run it:

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

-- Create indexes for performance
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own documents
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE USING (auth.uid() = user_id);
```

### Step 5: Restart the Application

```bash
# Stop the running server
pm2 delete webapp

# Rebuild (to pick up new env vars)
npm run build

# Start again
pm2 start ecosystem.config.cjs

# Check status
pm2 list
```

### Step 6: Test the Application

1. **Open**: https://3000-iabio49y68n0v0fixa0hj-2e1b9533.sandbox.novita.ai
2. **Sign Up**: Create a new account (email + password)
3. **Upload**: Click "Upload Document" and enter a title
4. **Process**: Click "Process OCR" on your document
5. **Wait**: 5 seconds for simulated processing
6. **View**: See the completed document with extracted content

## ✅ Features Working

- ✅ Landing page with professional UI
- ✅ Sign up / Login with email & password
- ✅ Protected dashboard route
- ✅ Upload documents (metadata only for now)
- ✅ View all your documents in a grid
- ✅ Process OCR (simulated 5-second processing)
- ✅ Real-time status updates
- ✅ Responsive sidebar navigation
- ✅ Secure data isolation (RLS)

## 📱 Test Flow

1. **Landing** → Click "Get Started"
2. **Auth** → Sign up with email: `test@example.com`, password: `test123`
3. **Dashboard** → Click "Upload Document"
4. **Upload** → Enter title: "Invoice Q4 2024" → Upload
5. **Process** → Click "Process OCR" on the pending document
6. **Wait** → Watch status change: pending → processing → completed
7. **View** → See extracted content in the card

## 🎨 What's Included

- **Frontend**: React 18 (CDN) + Tailwind CSS
- **Backend**: Hono on Cloudflare Workers
- **Database**: Supabase (PostgreSQL with RLS)
- **Auth**: Supabase Auth (email/password)
- **UI Components**: Landing, Auth, Dashboard with sidebar
- **API Routes**: `/api/documents` (GET/POST), `/api/process-ocr` (POST)

## 🚨 Common Issues

### "Missing Supabase credentials"
→ Edit `.dev.vars` with your actual credentials and restart

### Authentication fails
→ Check Supabase Email provider is enabled (it should be by default)

### Documents not showing
→ Verify you ran the SQL schema in Supabase SQL Editor

### Port already in use
→ Run: `pm2 delete webapp` or `fuser -k 3000/tcp`

## 📚 Full Documentation

- **README.md** - Complete project documentation
- **SUPABASE_SETUP.md** - Detailed Supabase setup guide

## 🚀 Next Steps

After basic testing works:

1. **Integrate Real OCR**: Replace simulated processing with actual OCR (Tesseract.js, Google Vision API)
2. **File Upload**: Add file storage with Cloudflare R2 or Supabase Storage
3. **Deploy**: Deploy to Cloudflare Pages for production
4. **Enhance**: Add features like batch processing, email notifications, etc.

---

**Need Help?** Check the full README.md or SUPABASE_SETUP.md files for detailed guides!
