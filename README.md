# SaaS Document Processor

A modern, scalable SaaS application for processing documents with AI-powered OCR capabilities. Built with React, Hono, Cloudflare Workers, and Supabase.

## 🌐 Live Demo

**Development URL**: https://3000-iabio49y68n0v0fixa0hj-2e1b9533.sandbox.novita.ai

## 📋 Project Overview

- **Name**: SaaS Document Processor
- **Goal**: Transform document workflows with intelligent OCR processing
- **Stack**: 
  - Frontend: React 18, Tailwind CSS, Lucide React icons
  - Backend: Hono (Cloudflare Workers)
  - Database & Auth: Supabase
  - Deployment: Cloudflare Pages

## ✨ Features

### Completed Features

✅ **Landing Page**
- Professional, responsive design with Tailwind CSS
- Feature highlights and call-to-action sections
- Mobile-friendly layout

✅ **Authentication System**
- Full sign-up/login flow using Supabase Auth
- Email/password authentication
- Session management with automatic token refresh
- Protected routes

✅ **Dashboard**
- Sidebar navigation with responsive design
- Document listing with real-time status updates
- User profile display
- Sign out functionality

✅ **Document Management**
- Upload documents with custom titles
- View all documents in card grid layout
- Status tracking: pending, processing, completed, failed
- Document metadata display (title, status, content, created_at)

✅ **OCR Processing**
- `/api/process-ocr` endpoint in Hono backend
- Simulated 5-second processing task
- Automatic status updates in Supabase
- Real-time UI feedback during processing

✅ **Security**
- Environment variable configuration (.env.example, .dev.vars)
- Row Level Security (RLS) in Supabase
- Bearer token authentication for API routes
- No hardcoded secrets

## 🗄️ Data Architecture

### Database Schema (Supabase)

**documents table:**
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key to auth.users)
- title: TEXT
- content: TEXT (nullable)
- status: TEXT (pending | processing | completed | failed)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

**Indexes:**
- `idx_documents_user_id` - Fast user document queries
- `idx_documents_status` - Status filtering
- `idx_documents_created_at` - Time-based sorting

**RLS Policies:**
- Users can only view their own documents
- Users can only insert/update/delete their own documents

### API Routes

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/api/process-ocr` | Process document OCR | No (document ID validation) |
| GET | `/api/documents` | Get user's documents | Yes (Bearer token) |
| POST | `/api/documents` | Create new document | Yes (Bearer token) |

### Data Flow

1. **User Sign Up/Login** → Supabase Auth → Session token stored in browser
2. **Upload Document** → POST `/api/documents` → Supabase insert → UI update
3. **Process OCR** → POST `/api/process-ocr` → 5s delay → Supabase update → UI refresh
4. **View Documents** → GET `/api/documents` → Supabase query with RLS → Display cards

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account (https://supabase.com)
- Git

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd webapp
npm install
```

### 2. Set Up Supabase

Follow the detailed instructions in **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** to:

1. Create a new Supabase project
2. Get your API credentials
3. Create the database schema
4. Configure Row Level Security (RLS)
5. Enable email authentication

**Quick Summary:**

1. Create project at https://app.supabase.com
2. Run this SQL in SQL Editor:

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

-- Create indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE USING (auth.uid() = user_id);
```

3. Copy `.env.example` to `.dev.vars` and add your credentials:

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars`:
```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key-here
```

### 3. Build & Run Locally

```bash
# Build the project
npm run build

# Start with PM2 (recommended for sandbox)
pm2 start ecosystem.config.cjs

# Check status
pm2 list

# View logs
pm2 logs webapp --nostream

# Or for local development (outside sandbox)
npm run dev
```

Access at: http://localhost:3000

### 4. Test the Application

1. **Sign Up**: Create a new account with email/password
2. **Upload**: Click "Upload Document" and enter a title
3. **Process**: Click "Process OCR" on any pending document
4. **Wait**: Watch the status change to "processing" (5 seconds)
5. **View**: See the completed document with extracted content

## 📦 Project Structure

```
webapp/
├── src/
│   ├── index.tsx           # Main Hono app with inline React
│   ├── lib/
│   │   └── supabase.ts     # Supabase client utilities
│   ├── types/
│   │   └── database.ts     # TypeScript type definitions
│   └── components/         # React components (embedded in index.tsx)
│       ├── Landing.tsx
│       ├── Auth.tsx
│       └── Dashboard.tsx
├── public/
│   └── static/             # Static assets
│       └── style.css
├── dist/                   # Build output (auto-generated)
├── .dev.vars              # Local environment variables (not in git)
├── .env.example           # Environment variable template
├── ecosystem.config.cjs   # PM2 configuration
├── wrangler.jsonc         # Cloudflare configuration
├── vite.config.ts         # Vite configuration
├── package.json           # Dependencies and scripts
├── SUPABASE_SETUP.md     # Detailed Supabase setup guide
└── README.md             # This file
```

## 🔧 Available Scripts

```bash
npm run dev           # Start Vite dev server
npm run build         # Build for production
npm run preview       # Preview production build
npm run deploy        # Deploy to Cloudflare Pages
npm run deploy:prod   # Deploy to production
npm run clean-port    # Clean port 3000
npm run test          # Test local server
```

## 🌍 Deployment

### Cloudflare Pages Deployment

1. **Set up Cloudflare API Token** (in the Cloudflare dashboard):
   - Go to "My Profile" → "API Tokens"
   - Create token with "Cloudflare Pages" permissions

2. **Configure environment variables**:
```bash
# Set secrets for production
wrangler pages secret put SUPABASE_URL
wrangler pages secret put SUPABASE_ANON_KEY
```

3. **Deploy**:
```bash
npm run deploy:prod
```

4. **Access your app**:
   - Production: `https://webapp.pages.dev`
   - Branch: `https://main.webapp.pages.dev`

### Environment Variables for Production

In Cloudflare Pages dashboard, set:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anon/public key

## 🎯 User Guide

### For End Users

1. **Landing Page**: Learn about the service and click "Get Started"
2. **Sign Up**: Create an account with your email and password (min 6 characters)
3. **Dashboard**: View your document dashboard after login
4. **Upload Documents**:
   - Click "Upload Document" button
   - Enter a document title
   - Click "Upload"
5. **Process Documents**:
   - Find your document in the grid
   - Click "Process OCR" button
   - Wait ~5 seconds for processing
   - View the extracted content
6. **Manage Documents**: View all your documents with status indicators

### For Developers

1. **Add new API routes**: Edit `src/index.tsx` and add new Hono routes
2. **Modify UI**: React components are embedded in `src/index.tsx`
3. **Update database**: Add SQL migrations in Supabase SQL Editor
4. **Test locally**: Always test with `npm run build` before deploying
5. **Check logs**: Use `pm2 logs webapp` to debug issues

## 🐛 Troubleshooting

### "Supabase credentials not configured"
- Verify `.dev.vars` exists with correct values
- Restart the development server

### Authentication fails
- Check Supabase email provider is enabled
- Verify email format is correct
- Check browser console for detailed errors

### Documents not loading
- Verify RLS policies are in place
- Check network tab for API errors
- Ensure user is authenticated

### OCR processing stuck
- Check server logs: `pm2 logs webapp`
- Verify document ID is correct
- Check Supabase connection

### Port 3000 already in use
```bash
npm run clean-port
# or
fuser -k 3000/tcp
```

## 🔒 Security Notes

- ✅ Environment variables are never committed to git (`.dev.vars` in `.gitignore`)
- ✅ Supabase anon key is safe to expose (public key with RLS protection)
- ✅ Row Level Security (RLS) ensures data isolation between users
- ✅ Bearer token authentication for all protected API routes
- ✅ HTTPS required for production deployment
- ⚠️ Never commit `.dev.vars` or expose service role keys

## 🚧 Not Yet Implemented

- [ ] File upload (currently only metadata)
- [ ] Actual OCR integration (currently simulated)
- [ ] Document preview
- [ ] Download processed documents
- [ ] Batch processing
- [ ] Email notifications
- [ ] Payment integration
- [ ] User profile management
- [ ] Admin dashboard
- [ ] Analytics and reporting

## 📈 Recommended Next Steps

1. **Integrate Real OCR**: Replace mock processing with actual OCR service (Tesseract.js, Google Vision, etc.)
2. **File Storage**: Add R2 or S3 integration for actual file uploads
3. **Email Notifications**: Send emails when processing completes
4. **Batch Processing**: Allow multiple document uploads
5. **Payment System**: Integrate Stripe for subscription billing
6. **Advanced Features**:
   - Document search and filtering
   - Export to PDF/Word
   - Collaboration features
   - API access for developers
7. **Performance**:
   - Implement caching
   - Add pagination for documents
   - Optimize image delivery
8. **Monitoring**: Add error tracking (Sentry) and analytics

## 📝 Tech Stack Details

- **Frontend**: React 18 (CDN), Tailwind CSS (CDN), Lucide React
- **Backend**: Hono v4, Cloudflare Workers Runtime
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/password)
- **Deployment**: Cloudflare Pages
- **Build Tool**: Vite 6
- **Process Manager**: PM2 (for local development)
- **TypeScript**: Full type safety

## 📄 License

This project is built as a demonstration SaaS application.

## 🤝 Contributing

This is a template project. Feel free to fork and customize for your needs!

---

Built with ❤️ using Hono, React, and Supabase on Cloudflare Pages

**Last Updated**: December 28, 2024
