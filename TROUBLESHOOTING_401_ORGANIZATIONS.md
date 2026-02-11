# Troubleshooting 401 Unauthorized - Organization Creation

**Date**: 2026-02-11  
**Status**: ✅ FIXED WITH ENHANCED LOGGING  
**GitHub Commit**: 66d7baba6cf990929641153f2f9c428a7f952396

---

## Overview

This guide helps diagnose and fix **401 Unauthorized** errors when creating organizations. The authentication flow has been enhanced with comprehensive logging to identify issues quickly.

---

## Quick Checklist

### ✅ Frontend Validation
- [ ] User has an active Supabase session
- [ ] Session token is not expired
- [ ] Authorization header is included in fetch request
- [ ] Token format is `Bearer <token>`

### ✅ Backend Validation
- [ ] `SUPABASE_URL` environment variable is set
- [ ] `SUPABASE_ANON_KEY` environment variable is set (not SERVICE_KEY)
- [ ] Authorization header is being passed to Supabase client
- [ ] RLS policies are configured correctly in Supabase

---

## Enhanced Logging

### Frontend Logs (Browser Console)

When creating an organization, you'll now see detailed logs:

```
[Create Org] Token obtained, length: 523
[Create Org] Making request with Authorization header...
[Create Org] Response status: 401
[Create Org] Error response: {...}
[Create Org] Status: 401
```

**Look for these issues:**
1. **No token**: `[Create Org] No valid session/token` → User needs to sign in again
2. **Session error**: `[Create Org] Session error: ...` → Session retrieval failed
3. **401 status**: Check backend logs for auth error details

### Backend Logs (PM2 / Cloudflare)

Enhanced step-by-step logging:

```
[Create Organization] ========== START ==========
[Create Organization] Authorization header present: true
[Create Organization] Token extracted, length: 523
[Create Organization] Supabase URL: https://...
[Create Organization] Anon key present: true
[Create Organization] Verifying user token...
[Create Organization] ✓ User verified: abc123...
[Create Organization] User email: user@example.com
[Create Organization] Creating organization: My Company
[Create Organization] Tax ID: 123456789
[Create Organization] Step 1: Inserting organization into database...
[Create Organization] ✓ Organization created successfully
[Create Organization] Organization ID: xyz789...
[Create Organization] Step 2: Adding user as owner...
[Create Organization] ✓ User added as owner successfully
[Create Organization] ========== SUCCESS ==========
```

**Look for these error patterns:**

#### ❌ Missing Authorization Header
```
[Create Organization] ❌ Missing Authorization header
```
**Fix**: Frontend is not sending the Authorization header. Verify fetch request.

#### ❌ Invalid Token
```
[Create Organization] ❌ Auth error: invalid JWT
[Create Organization] Auth error details: {...}
```
**Fix**: Token is expired or invalid. User needs to sign in again.

#### ❌ No User Found
```
[Create Organization] ❌ No user returned from auth
```
**Fix**: Token doesn't correspond to a valid user. Check Supabase auth state.

#### ❌ Organization Insert Failed
```
[Create Organization] ❌ Organization insert error: ...
[Create Organization] Error code: 42501
```
**Fix**: RLS policy issue. Check Supabase policies on `organizations` table.

#### ❌ Member Insert Failed
```
[Create Organization] ❌ Member insert error: ...
[Create Organization] Error code: 42501
```
**Fix**: RLS policy issue. Check Supabase policies on `organization_members` table.

---

## Common Issues & Solutions

### Issue 1: "No active session. Please sign in again."

**Cause**: User session expired or invalid

**Solution**:
```typescript
// Frontend will show this error automatically
// User needs to:
1. Sign out
2. Sign in again
3. Try creating organization again
```

### Issue 2: 401 with "Unauthorized - Missing Authorization header"

**Cause**: Frontend not sending Authorization header

**Solution**:
```typescript
// Check the fetch call includes:
headers: {
  'Authorization': 'Bearer ' + token
}
```

### Issue 3: 401 with "Unauthorized - Invalid token"

**Cause**: Token format wrong or expired

**Solution**:
```typescript
// Verify token extraction:
const { data: { session }, error } = await supabaseClient.auth.getSession();
const token = session?.access_token; // ✅ Correct
// NOT: session?.session?.access_token
```

### Issue 4: 500 with "Failed to create organization"

**Cause**: RLS policy blocking insert

**Solution - Check Supabase RLS Policies**:

```sql
-- Required policy for organizations table
CREATE POLICY "Users can insert organizations"
ON organizations FOR INSERT
TO authenticated
WITH CHECK (true);

-- Required policy for organization_members table
CREATE POLICY "Users can insert own memberships"
ON organization_members FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

### Issue 5: Environment Variables Missing

**Cause**: Cloudflare environment not configured

**Solution**:
```bash
# Add via Wrangler CLI
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY

# Verify in Cloudflare Dashboard:
# Settings → Environment Variables → Production
```

---

## Testing the Fix

### Local Testing

```bash
# 1. Ensure .dev.vars has correct values
cat .dev.vars

# Should contain:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=eyJhbG...

# 2. Rebuild and restart
npm run build
pm2 restart webapp

# 3. Check logs
pm2 logs webapp --nostream | grep "Create Organization"

# 4. Test in browser
# - Open http://localhost:3000
# - Sign in
# - Try creating an organization
# - Check browser console and PM2 logs
```

### Production Testing (Cloudflare)

```bash
# 1. Verify environment variables
npx wrangler secret list

# Should show:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY

# 2. Check Cloudflare logs
# Dashboard → Workers & Pages → webapp → Logs
# Filter for: "Create Organization"

# 3. Test in browser
# - Open https://webapp.pages.dev
# - Sign in
# - Try creating an organization
# - Check browser console for frontend logs
```

---

## Debug Workflow

### Step 1: Check Frontend Session

Open browser console and run:
```javascript
// Get current session
const { data: { session }, error } = await supabaseClient.auth.getSession();
console.log('Session:', session);
console.log('Token:', session?.access_token);
console.log('Token length:', session?.access_token?.length);
```

**Expected**: Token should be ~500-600 characters, JWT format

### Step 2: Test API Manually

```bash
# Get your token from browser console first
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test the endpoint
curl -X POST http://localhost:3000/api/organizations/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Organization","tax_id":"123456789"}' \
  -v

# Check response:
# - 200 OK = Success
# - 401 Unauthorized = Auth issue (check logs)
# - 500 Error = Database/RLS issue
```

### Step 3: Check Backend Logs

```bash
# Local (PM2)
pm2 logs webapp --nostream | tail -50

# Look for:
# - "========== START =========="
# - Any ❌ error markers
# - Error codes (42501 = RLS, 42P01 = table not found, etc.)

# Production (Cloudflare)
# Dashboard → Workers & Pages → webapp → Logs → Real-time
# Filter by: "Create Organization"
```

### Step 4: Verify Supabase Configuration

1. **Check RLS Policies**:
   - Go to Supabase Dashboard → Table Editor
   - Select `organizations` table → RLS tab
   - Verify INSERT policy exists for authenticated users
   - Select `organization_members` table → RLS tab
   - Verify INSERT policy exists with `auth.uid() = user_id` check

2. **Test RLS with SQL Editor**:
   ```sql
   -- This should work (INSERT as authenticated user)
   INSERT INTO organizations (name, tax_id)
   VALUES ('Test Org', '123456789')
   RETURNING *;
   
   -- This should also work
   INSERT INTO organization_members (organization_id, user_id, role)
   VALUES (
     (SELECT id FROM organizations LIMIT 1),
     auth.uid(),
     'owner'
   );
   ```

---

## Required Supabase Setup

### Database Schema

```sql
-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members table
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
```

### RLS Policies

```sql
-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Users can insert organizations"
ON organizations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view organizations they belong to"
ON organizations FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);

-- Organization members policies
CREATE POLICY "Users can insert own memberships"
ON organization_members FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own memberships"
ON organization_members FOR SELECT
TO authenticated
USING (user_id = auth.uid());
```

---

## Key Changes in This Fix

### Frontend (src/index.tsx ~line 1317)

**Enhanced Session Validation**:
```typescript
// Get session with error handling
const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

if (sessionError) {
  console.error('[Create Org] Session error:', sessionError);
  setError('Failed to get session: ' + sessionError.message);
  return;
}

if (!session?.access_token) {
  console.error('[Create Org] No valid session/token');
  setError('No active session. Please sign in again.');
  return;
}

const token = session.access_token;
console.log('[Create Org] Token obtained, length:', token.length);
```

**Better Error Messages**:
```typescript
const errorMsg = (errorData.error || 'Failed to create organization') + 
                 ' (Status: ' + response.status + ')';
setError(errorMsg);
```

### Backend (src/index.tsx ~line 583)

**Step-by-Step Logging**:
```typescript
console.log('[Create Organization] ========== START ==========')
console.log('[Create Organization] Authorization header present:', !!authHeader)
console.log('[Create Organization] Token extracted, length:', token.length)
console.log('[Create Organization] Verifying user token...')
console.log('[Create Organization] ✓ User verified:', user.id)
console.log('[Create Organization] Step 1: Inserting organization...')
console.log('[Create Organization] ✓ Organization created successfully')
console.log('[Create Organization] Step 2: Adding user as owner...')
console.log('[Create Organization] ✓ User added as owner successfully')
console.log('[Create Organization] ========== SUCCESS ==========')
```

**Enhanced Error Responses**:
```typescript
return c.json({ 
  error: 'Failed to create organization', 
  details: orgError.message,
  code: orgError.code 
}, 500)
```

---

## Summary

**Problem**: 401 Unauthorized when creating organizations

**Root Causes**:
1. Using SERVICE_KEY instead of ANON_KEY (bypassed RLS) ✅ Fixed
2. Insufficient error logging (hard to diagnose) ✅ Fixed
3. Missing RLS policies in Supabase (depends on setup) ⚠️ Check required

**Solutions Applied**:
1. ✅ Switch to ANON_KEY with user token for RLS enforcement
2. ✅ Add comprehensive step-by-step logging
3. ✅ Enhanced error messages with status codes
4. ✅ Frontend session validation with early returns
5. ✅ Backend detailed auth flow logging

**Status**: Complete - Deployed to production

**Next Steps**:
1. Verify Supabase RLS policies are configured
2. Add environment variables in Cloudflare if missing
3. Test organization creation with new logging
4. Check logs to diagnose any remaining issues

---

## Related Documentation
- [Organization Auth Fix](./ORGANIZATION_AUTH_FIX.md)
- [Multi-Tenant System](./MULTI_TENANT_SYSTEM.md)
- [Security Guide](./SECURITY.md)

---

## Support

If you're still experiencing 401 errors after following this guide:

1. **Check Frontend Logs**: Open browser DevTools → Console
2. **Check Backend Logs**: `pm2 logs webapp --nostream` or Cloudflare Dashboard
3. **Verify Token**: Copy token from browser, decode at jwt.io to check validity
4. **Test RLS**: Use Supabase SQL Editor to test INSERT operations
5. **Review Environment**: Ensure all env vars are set correctly

The enhanced logging will show exactly where the authentication is failing.
