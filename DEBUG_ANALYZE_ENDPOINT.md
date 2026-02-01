# Debug Fix: /api/invoices/analyze - 500 Error Diagnosis

## Issue
User reported getting a **500 Internal Server Error** on `/api/invoices/analyze` despite:
- ✓ `OPENAI_API_KEY` is set in Cloudflare Dashboard
- ✓ OpenAI account has $10 credits
- ✓ Code uses environment variable (not hardcoded)

## Root Cause Investigation

The issue could be caused by:
1. **Environment variable not accessible** - `c.env` not properly initialized
2. **Fetch API failure** - Network issues calling OpenAI
3. **Response parsing errors** - Invalid JSON from OpenAI
4. **Timeout issues** - OpenAI taking too long to respond
5. **API key format issues** - Key not properly formatted

## Solution Implemented

### Enhanced Debug Logging

The endpoint now has **comprehensive step-by-step logging** to diagnose the exact failure point:

```typescript
app.post('/api/invoices/analyze', async (c) => {
  console.log('=== INVOICE ANALYZE START ===')
  
  try {
    // Step 1: Check environment
    console.log('[Invoice Analyze] Step 1: Endpoint called')
    console.log('[Invoice Analyze] Environment check:')
    console.log('  - c.env exists:', !!c.env)
    console.log('  - c.env.OPENAI_API_KEY exists:', !!c.env?.OPENAI_API_KEY)
    
    // Step 2: Parse request
    let body
    try {
      body = await c.req.json()
      console.log('[Invoice Analyze] Step 2: Body parsed successfully')
    } catch (parseError) {
      // Detailed parse error logging
    }
    
    // Step 3: Validate file data
    console.log('[Invoice Analyze] Step 3: File data received (length:', fileData.length, ')')
    
    // Step 4: Check API key
    const openaiApiKey = c.env?.OPENAI_API_KEY
    console.log('[Invoice Analyze] ✓ API Key found (length:', openaiApiKey.length, ')')
    
    // Step 5: Call OpenAI
    console.log('[Invoice Analyze] Step 5: Calling OpenAI API...')
    console.log('[Invoice Analyze] URL: https://api.openai.com/v1/chat/completions')
    console.log('[Invoice Analyze] Model: gpt-4o')
    
    // Step 6: Check response
    console.log('[Invoice Analyze] Step 6: OpenAI responded with status:', openaiResponse.status)
    
    // Step 7: Parse response
    console.log('[Invoice Analyze] Step 7: OpenAI response parsed successfully')
    
    // Step 8: Extract content
    console.log('[Invoice Analyze] Step 8: Raw content from GPT-4o:', content)
    
    // Step 9: Parse JSON
    console.log('[Invoice Analyze] ✓ Step 9: Successfully extracted:', extracted)
    console.log('=== INVOICE ANALYZE SUCCESS ===')
    
  } catch (error: any) {
    console.error('=== INVOICE ANALYZE CRITICAL ERROR ===')
    console.error('[Invoice Analyze] Error message:', error.message)
    console.error('[Invoice Analyze] Error stack:', error.stack)
    return c.json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: error.stack,  // Return full stack trace
      supplier_name: null,
      total_amount: null
    }, 500)
  }
})
```

### Error Handling Improvements

**1. Request Body Parsing:**
```typescript
try {
  body = await c.req.json()
  console.log('[Invoice Analyze] Step 2: Body parsed successfully')
} catch (parseError) {
  console.error('[Invoice Analyze] Body parse error:', parseError)
  return c.json({ 
    error: 'Failed to parse request body', 
    details: parseError.message 
  }, 400)
}
```

**2. Environment Variable Check:**
```typescript
const openaiApiKey = c.env?.OPENAI_API_KEY

if (!openaiApiKey) {
  console.error('[Invoice Analyze] ❌ OPENAI_API_KEY not found in environment')
  console.error('[Invoice Analyze] Available env keys:', Object.keys(c.env || {}))
  return c.json({ 
    error: 'Missing OPENAI_API_KEY in Cloudflare Settings',
    hint: 'Add OPENAI_API_KEY in Cloudflare Dashboard → Settings → Environment Variables',
    supplier_name: null,
    total_amount: null
  }, 500)
}

console.log('[Invoice Analyze] ✓ API Key found (length:', openaiApiKey.length, ')')
```

**3. Fetch Error Handling:**
```typescript
try {
  openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify(requestPayload)
  })
  
  console.log('[Invoice Analyze] Step 6: OpenAI responded with status:', openaiResponse.status)
} catch (fetchError) {
  console.error('[Invoice Analyze] Fetch error:', fetchError)
  return c.json({ 
    error: 'Network error calling OpenAI', 
    details: fetchError.message 
  }, 500)
}
```

**4. OpenAI API Error Response:**
```typescript
if (!openaiResponse.ok) {
  let errorText
  try {
    errorText = await openaiResponse.text()
  } catch {
    errorText = 'Unable to read error response'
  }
  console.error('[Invoice Analyze] ❌ OpenAI API error (status:', openaiResponse.status, ')')
  console.error('[Invoice Analyze] Error details:', errorText)
  return c.json({ 
    error: 'OpenAI API error', 
    status: openaiResponse.status,
    details: errorText 
  }, 500)
}
```

**5. JSON Parse Error:**
```typescript
try {
  openaiData = await openaiResponse.json()
  console.log('[Invoice Analyze] Step 7: OpenAI response parsed successfully')
} catch (jsonError) {
  console.error('[Invoice Analyze] Failed to parse OpenAI response:', jsonError)
  return c.json({ 
    error: 'Invalid JSON from OpenAI', 
    details: jsonError.message 
  }, 500)
}
```

**6. Content Extraction:**
```typescript
const content = openaiData.choices?.[0]?.message?.content
if (!content) {
  console.error('[Invoice Analyze] ❌ No content in OpenAI response')
  console.error('[Invoice Analyze] Full response:', JSON.stringify(openaiData))
  return c.json({ 
    error: 'No content from OpenAI',
    supplier_name: null,
    total_amount: null
  }, 200)
}
```

## Diagnostic Console Logs

### Success Flow (Expected):
```
=== INVOICE ANALYZE START ===
[Invoice Analyze] Step 1: Endpoint called
[Invoice Analyze] Environment check:
  - c.env exists: true
  - c.env.OPENAI_API_KEY exists: true
[Invoice Analyze] Step 2: Body parsed successfully
[Invoice Analyze] Step 3: File data received (length: 123456)
[Invoice Analyze] ✓ API Key found (length: 107)
[Invoice Analyze] Step 4: Preparing OpenAI API request
[Invoice Analyze] Step 5: Calling OpenAI API...
[Invoice Analyze] URL: https://api.openai.com/v1/chat/completions
[Invoice Analyze] Model: gpt-4o
[Invoice Analyze] Step 6: OpenAI responded with status: 200
[Invoice Analyze] Step 7: OpenAI response parsed successfully
[Invoice Analyze] Step 8: Raw content from GPT-4o: {"supplier_name":"Google","total_amount":1500.00}
[Invoice Analyze] ✓ Step 9: Successfully extracted: { supplier_name: 'Google', total_amount: 1500 }
=== INVOICE ANALYZE SUCCESS ===
```

### Error Scenarios:

**Scenario 1: Missing Environment Variable**
```
=== INVOICE ANALYZE START ===
[Invoice Analyze] Step 1: Endpoint called
[Invoice Analyze] Environment check:
  - c.env exists: true
  - c.env.OPENAI_API_KEY exists: false
[Invoice Analyze] ❌ OPENAI_API_KEY not found in environment
[Invoice Analyze] Available env keys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
```

**Response:**
```json
{
  "error": "Missing OPENAI_API_KEY in Cloudflare Settings",
  "hint": "Add OPENAI_API_KEY in Cloudflare Dashboard → Settings → Environment Variables",
  "supplier_name": null,
  "total_amount": null
}
```

**Scenario 2: Network Error**
```
[Invoice Analyze] Step 5: Calling OpenAI API...
[Invoice Analyze] Fetch error: TypeError: fetch failed
```

**Response:**
```json
{
  "error": "Network error calling OpenAI",
  "details": "fetch failed"
}
```

**Scenario 3: Invalid API Key**
```
[Invoice Analyze] Step 6: OpenAI responded with status: 401
[Invoice Analyze] ❌ OpenAI API error (status: 401)
[Invoice Analyze] Error details: {"error":{"message":"Incorrect API key","type":"invalid_request_error"}}
```

**Response:**
```json
{
  "error": "OpenAI API error",
  "status": 401,
  "details": "{\"error\":{\"message\":\"Incorrect API key\",\"type\":\"invalid_request_error\"}}"
}
```

**Scenario 4: Rate Limit**
```
[Invoice Analyze] Step 6: OpenAI responded with status: 429
[Invoice Analyze] ❌ OpenAI API error (status: 429)
[Invoice Analyze] Error details: {"error":{"message":"Rate limit exceeded"}}
```

**Response:**
```json
{
  "error": "OpenAI API error",
  "status": 429,
  "details": "{\"error\":{\"message\":\"Rate limit exceeded\"}}"
}
```

## How to Diagnose with New Logs

### Step-by-Step Diagnosis:

1. **Open Browser Console** (F12 → Console tab)

2. **Upload an Invoice** (trigger the analyze endpoint)

3. **Check Console Logs** - Look for the exact step where it fails:
   - **Stops at Step 1?** → Environment setup issue
   - **Stops at Step 3?** → File data issue
   - **Stops at Step 4?** → API key missing or inaccessible
   - **Stops at Step 6?** → OpenAI API call failed (check status code)
   - **Stops at Step 7?** → Invalid JSON response from OpenAI
   - **Stops at Step 8?** → No content in OpenAI response

4. **Check Network Tab** (F12 → Network tab)
   - Look for `/api/invoices/analyze` request
   - Check Response tab for error details
   - Response will include `message` and `stack` trace

5. **Share the Logs** - Send the console output showing:
   - Which step it stopped at
   - The error message
   - The response status code (if it got to OpenAI)

## Files Modified

| File | Change |
|------|--------|
| `src/index.tsx` | Rewrote `/api/invoices/analyze` with 9-step debug logging |
| `src/index.tsx` | Added comprehensive try/catch blocks for each operation |
| `src/index.tsx` | Enhanced error messages with details, hints, and stack traces |

## Deployment Status

✅ **Pushed to GitHub**
- **Repository**: https://github.com/972cfe-dotcom/Atest
- **Commit**: `a01c5338bbf50b6856359b6930b33c074b7014fa`
- **Date**: 2026-02-01T01:37:31Z
- **Message**: "Fix: Rewrite /api/invoices/analyze with comprehensive debug logging for 500 error diagnosis"

✅ **Cloudflare Auto-Deploy**
- Expected deploy time: 1-2 minutes
- Watch Cloudflare Dashboard → Deployments for status

## Testing Instructions

1. **Wait for Cloudflare deploy** (1-2 minutes)

2. **Open your app** and sign in

3. **Open Browser Console** (F12 → Console tab)

4. **Go to Invoices** → Upload Invoice

5. **Select an invoice file**

6. **Watch Console** - You'll see detailed step-by-step logs

7. **If it fails**:
   - Note which step it stopped at
   - Copy the error message
   - Check the Network tab for response details
   - Share the logs with me

## Expected Outcomes

### Success Case:
- All 9 steps complete
- Supplier name and amount auto-fill
- Console shows `=== INVOICE ANALYZE SUCCESS ===`

### Failure Cases:
- Console shows exactly where it failed
- Response includes detailed error message
- You can share specific logs for diagnosis

## Environment Variable Verification

To ensure `OPENAI_API_KEY` is properly set in Cloudflare:

1. Go to **Cloudflare Dashboard**
2. Navigate to **Workers & Pages**
3. Select your project: `webapp`
4. Go to **Settings** → **Environment Variables**
5. Verify `OPENAI_API_KEY` is listed (for Production environment)
6. The value should start with `sk-proj-` or `sk-`

## Next Steps

1. **Deploy and Test** - Wait for auto-deploy, then test with a real invoice
2. **Share Logs** - If it still fails, share the console logs showing which step failed
3. **Verify Environment** - Double-check `OPENAI_API_KEY` is in Production environment (not just Preview)

---

**Status**: ✅ COMPREHENSIVE DEBUG LOGGING DEPLOYED  
**Ready for Testing**: Yes  
**Console Logs**: Now show 9 detailed steps for diagnosis
