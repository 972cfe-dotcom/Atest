# Organization Authentication Fix - RLS Implementation

**Date**: 2026-02-10  
**Status**: ✅ COMPLETED AND DEPLOYED  
**GitHub**: https://github.com/972cfe-dotcom/Atest  
**Commit**: 48db815bfcdae3448414e24532a45db20fbd9bff

---

## Problem Statement

**401 Unauthorized Error** when creating organizations due to incorrect authentication flow with Supabase RLS (Row Level Security).

### Root Cause
The backend API endpoints (`/api/organizations` and `/api/organizations/create`) were using **SUPABASE_SERVICE_KEY** instead of **SUPABASE_ANON_KEY** with the user's authorization token, which bypassed Row Level Security policies.

---

## Solution

### Backend Changes

#### ✅ Fixed Endpoints

1. **GET `/api/organizations`** (Line 515)
2. **POST `/api/organizations/create`** (Line 574)

#### Key Changes

**BEFORE (❌ Incorrect - Bypasses RLS):**
```typescript
const supabaseServiceKey = c.env?.SUPABASE_SERVICE_KEY || 'missing'
const supabase = createClient(supabaseUrl, supabaseServiceKey)
```

**AFTER (✅ Correct - Enforces RLS):**
```typescript
const supabaseAnonKey = c.env?.SUPABASE_ANON_KEY || 'missing'

// Create Supabase client with user's token for RLS
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      Authorization: authHeader
    }
  }
})
```

### Frontend Implementation (Already Correct ✅)

The frontend was already correctly implemented:

```typescript
// Get user session
const { data: session } = await supabaseClient.auth.getSession();
const token = session?.session?.access_token;

// Include Authorization header
const response = await fetch('/api/organizations/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: orgName.trim(),
    tax_id: taxId.trim() || null
  })
});
```

---

## How RLS Works Now

### Authentication Flow

1. **Frontend**: Gets user session token from Supabase Auth
2. **Frontend**: Sends API request with `Authorization: Bearer <token>` header
3. **Backend**: Receives Authorization header
4. **Backend**: Creates Supabase client with ANON_KEY + user's token
5. **Backend**: Supabase enforces RLS policies using `auth.uid()`
6. **Backend**: User can only access/modify their own organizations

### RLS Policies Applied

```sql
-- Users can only see organizations they are members of
CREATE POLICY "Users can view own organizations"
ON organization_members FOR SELECT
USING (auth.uid() = user_id);

-- Users can only create organizations for themselves
CREATE POLICY "Users can insert own memberships"
ON organization_members FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

---

## Affected Endpoints

### ✅ Fixed (Now Use ANON_KEY + RLS)
- `GET /api/organizations` - Fetch user's organizations
- `POST /api/organizations/create` - Create new organization

### ✅ Correctly Use SERVICE_KEY (Storage Operations)
- `POST /api/invoices/upload` - Requires SERVICE_KEY for Supabase Storage
- `DELETE /api/invoices/:id` - Requires SERVICE_KEY for Supabase Storage

**Note**: Invoice endpoints correctly use SERVICE_KEY because they need to:
- Upload files to Supabase Storage (requires elevated permissions)
- Still verify user identity via `auth.getUser(token)` before operations

---

## Testing Checklist

### ✅ Organization Creation Flow
- [x] User can create new organization
- [x] Organization is inserted into `organizations` table
- [x] User is added to `organization_members` with role='owner'
- [x] Returns 401 if Authorization header is missing
- [x] Returns 401 if token is invalid or expired

### ✅ Organization Listing Flow
- [x] User can fetch their organizations
- [x] Only sees organizations they are members of
- [x] RLS policy filters results by user_id
- [x] Returns 401 if Authorization header is missing

### ✅ Multi-Tenant Security
- [x] User A cannot see User B's organizations
- [x] User A cannot create organizations for User B
- [x] All operations respect `auth.uid()` in RLS policies

---

## Environment Variables

### Required in Cloudflare (Production)

```bash
# Authentication
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Public key, enforces RLS
SUPABASE_SERVICE_KEY=eyJhbG...  # Admin key, only for storage operations

# Optional (for other features)
GOOGLE_API_KEY=AIza...
CLICKSEND_USERNAME=user@example.com
CLICKSEND_API_KEY=xyz...
ADMIN_PHONE_NUMBER=+972...
```

### Setup Commands

```bash
# Add via Wrangler CLI
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_KEY
```

---

## Local Development

### .dev.vars File
```env
SUPABASE_URL=https://dmnxblcdaqnenggfyurw.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
GOOGLE_API_KEY=AIza...
```

### Test Commands
```bash
# Build
npm run build

# Start local dev server
npm run dev

# Test organization creation
curl -X POST http://localhost:3000/api/organizations/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -d '{"name":"Test Org","tax_id":"123456789"}'
```

---

## Security Improvements

### ✅ Before This Fix
- ❌ Used SERVICE_KEY for all operations
- ❌ Bypassed RLS policies
- ❌ Could potentially access any organization
- ❌ No enforcement of user ownership

### ✅ After This Fix
- ✅ Uses ANON_KEY with user tokens
- ✅ Enforces RLS policies on all queries
- ✅ Users can only access their own organizations
- ✅ `auth.uid()` properly enforced

---

## Deployment Status

### GitHub
- **Repository**: https://github.com/972cfe-dotcom/Atest
- **Branch**: main
- **Commit**: 48db815bfcdae3448414e24532a45db20fbd9bff
- **Message**: "Fix: Organization authentication - use ANON_KEY with RLS instead of SERVICE_KEY"

### Cloudflare Pages
- **URL**: https://webapp.pages.dev
- **Status**: ✅ Auto-deployment triggered
- **Build**: dist/_worker.js (280.18 kB)

---

## Related Documentation
- [Multi-Tenant System](./MULTI_TENANT_SYSTEM.md)
- [Security Fix (Secrets)](./SECURITY_FIX.md)
- [i18n & RTL Support](./I18N_RTL_SUPPORT.md)

---

## Summary

**Problem**: 401 Unauthorized when creating organizations due to SERVICE_KEY bypassing RLS.

**Solution**: Switched to ANON_KEY with user Authorization header to enforce RLS policies.

**Result**: ✅ Organizations now respect user ownership; secure multi-tenant architecture; all operations properly authenticated.

**Status**: COMPLETE - Deployed to production (https://webapp.pages.dev)
