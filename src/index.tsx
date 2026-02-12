import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from './lib/supabase'
import { extractInvoiceData } from './lib/invoiceExtraction'
import type { Document, Invoice } from './types/database'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  OPENAI_API_KEY: string
  GOOGLE_API_KEY: string
  CLICKSEND_USERNAME: string
  CLICKSEND_API_KEY: string
  ADMIN_PHONE_NUMBER: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// API Routes
app.post('/api/process-ocr', async (c) => {
  try {
    const { documentId } = await c.req.json()

    if (!documentId) {
      return c.json({ error: 'Document ID is required' }, 400)
    }

    // Create Supabase client - no env needed
    const supabase = createServerSupabaseClient()

    // Verify document exists and is pending
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (fetchError || !document) {
      return c.json({ error: 'Document not found' }, 404)
    }

    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', documentId)

    // Simulate 5-second OCR processing
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Update status to completed with mock OCR result
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        content: `Processed content for: ${document.title}. This is mock OCR output.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select()
      .single()

    if (updateError) {
      return c.json({ error: 'Failed to update document' }, 500)
    }

    return c.json({ success: true, document: updatedDoc })
  } catch (error) {
    console.error('OCR processing error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get documents for user
app.get('/api/documents', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const supabase = createServerSupabaseClient()
    
    // Get user from auth header
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // Fetch user's documents
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (fetchError) {
      return c.json({ error: 'Failed to fetch documents' }, 500)
    }

    return c.json({ documents })
  } catch (error) {
    console.error('Fetch documents error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create document
app.post('/api/documents', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const { title } = await c.req.json()

    if (!title) {
      return c.json({ error: 'Title is required' }, 400)
    }

    const supabase = createServerSupabaseClient(c.env)

    // Get user from auth header
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // Create document
    const { data: document, error: createError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title,
        status: 'pending',
        content: null,
      })
      .select()
      .single()

    if (createError) {
      return c.json({ error: 'Failed to create document' }, 500)
    }

    return c.json({ document })
  } catch (error) {
    console.error('Create document error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ============================================
// Invoice API Routes
// ============================================

// Get all invoices for user

// Analyze invoice with Google Gemini 1.5 Flash - Pure REST API (Debug Version)
app.post('/api/invoices/analyze', async (c) => {
  // CRITICAL: Check API key FIRST before anything else
  const apiKey = c.env?.GOOGLE_API_KEY
  
  console.log('=== GEMINI ANALYZE START ===')
  console.log('[Gemini] CRITICAL CHECK - API Key exists:', !!apiKey)
  
  if (!apiKey) {
    console.error('❌ CRITICAL: GOOGLE_API_KEY is missing in c.env')
    console.error('[Gemini] c.env keys:', Object.keys(c.env || {}))
    return c.json({ 
      error: 'Configuration Error', 
      details: 'GOOGLE_API_KEY is missing from Cloudflare Environment Variables',
      available_keys: Object.keys(c.env || {}),
      hint: 'Add GOOGLE_API_KEY in Cloudflare Dashboard → Settings → Environment Variables → Production'
    }, 500)
  }
  
  console.log('[Gemini] ✓ API Key found (length:', apiKey.length, ')')
  console.log('[Gemini] ✓ API Key starts with:', apiKey.substring(0, 10) + '...')
  
  try {
    console.log('[Gemini] Step 1: Parsing request body...')
    
    // Parse request body
    let body
    try {
      body = await c.req.json()
      console.log('[Gemini] ✓ Body parsed successfully')
    } catch (parseError: any) {
      console.error('[Gemini] ❌ Body parse error:', parseError.message)
      return c.json({ 
        error: 'Failed to parse request body', 
        details: parseError.message 
      }, 400)
    }
    
    const fileData = body.fileData
    const mimeType = body.mimeType || 'image/jpeg'
    
    if (!fileData) {
      console.error('[Gemini] ❌ No file data in request')
      return c.json({ 
        error: 'File data is required',
        received_keys: Object.keys(body)
      }, 400)
    }
    
    console.log('[Gemini] ✓ File data received')
    console.log('[Gemini] MIME type:', mimeType)
    console.log('[Gemini] Data URL length:', fileData.length)
    
    // Extract base64 data from data URL
    let base64Data = fileData
    if (fileData.includes(',')) {
      const parts = fileData.split(',')
      base64Data = parts[1]
      console.log('[Gemini] ✓ Extracted base64 from data URL')
    }
    
    console.log('[Gemini] Base64 data length:', base64Data.length)
    
    const prompt = `Analyze this invoice. Extract the 'supplier_name' (Hebrew/English) and 'total_amount'. 
Return ONLY a clean JSON object: { "supplier_name": "...", "total_amount": 0.00 }. 
Do not include Markdown formatting.`

    console.log('[Gemini] Step 2: Building API request...')
    
    // Build REST API request payload
    const requestPayload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 300
      }
    }
    
    // Gemini 2.0 Flash - Available for user's Google Cloud Project
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
    
    console.log('[Gemini] Step 3: Calling Google Gemini API...')
    console.log('[Gemini] URL:', apiUrl.replace(apiKey, 'AIza***'))
    console.log('[Gemini] Payload size:', JSON.stringify(requestPayload).length, 'bytes')
    
    let geminiResponse
    try {
      geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      })
      
      console.log('[Gemini] ✓ Response received')
      console.log('[Gemini] Status:', geminiResponse.status, geminiResponse.statusText)
    } catch (fetchError: any) {
      console.error('[Gemini] ❌ Fetch error:', fetchError.message)
      console.error('[Gemini] Stack:', fetchError.stack)
      return c.json({ 
        error: 'Network error calling Google Gemini', 
        details: fetchError.message,
        stack: fetchError.stack
      }, 500)
    }
    
    // CRITICAL: Read error response for non-200 status
    if (!geminiResponse.ok) {
      console.error('[Gemini] ❌ API returned error status:', geminiResponse.status)
      
      let errorText = ''
      let errorJson = null
      
      try {
        errorText = await geminiResponse.text()
        console.error('[Gemini] Error response (raw):', errorText)
        
        try {
          errorJson = JSON.parse(errorText)
          console.error('[Gemini] Error response (parsed):', JSON.stringify(errorJson, null, 2))
        } catch {
          // Not JSON
        }
      } catch (readError: any) {
        console.error('[Gemini] ❌ Failed to read error response:', readError.message)
        errorText = 'Unable to read error response'
      }
      
      return c.json({ 
        error: 'Google Gemini API error', 
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        details: errorText,
        structured_error: errorJson,
        api_key_provided: !!apiKey,
        api_key_length: apiKey.length
      }, 500)
    }
    
    // Parse successful response
    console.log('[Gemini] Step 4: Parsing response...')
    let geminiData
    try {
      geminiData = await geminiResponse.json()
      console.log('[Gemini] ✓ Response parsed')
      console.log('[Gemini] Response keys:', Object.keys(geminiData).join(', '))
    } catch (jsonError: any) {
      console.error('[Gemini] ❌ JSON parse error:', jsonError.message)
      return c.json({ 
        error: 'Invalid JSON from Google Gemini', 
        details: jsonError.message 
      }, 500)
    }
    
    // Extract content
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      console.error('[Gemini] ❌ No content in response')
      console.error('[Gemini] Full response:', JSON.stringify(geminiData))
      return c.json({ 
        error: 'No content from Google Gemini',
        response_summary: {
          has_candidates: !!geminiData.candidates,
          candidates_length: geminiData.candidates?.length || 0
        },
        supplier_name: null,
        total_amount: null
      }, 200)
    }
    
    console.log('[Gemini] ✓ Content extracted (length:', content.length, ')')
    console.log('[Gemini] Content preview:', content.substring(0, 100))
    
    // Parse JSON from content
    console.log('[Gemini] Step 5: Parsing extracted data...')
    try {
      let jsonStr = content.trim()
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        console.log('[Gemini] Removed ```json markers')
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim()
        console.log('[Gemini] Removed ``` markers')
      }
      
      const extracted = JSON.parse(jsonStr)
      console.log('[Gemini] ✓ Successfully extracted:', extracted)
      console.log('=== GEMINI ANALYZE SUCCESS ===')
      
      return c.json({
        success: true,
        supplier_name: extracted.supplier_name || null,
        total_amount: extracted.total_amount || null
      })
      
    } catch (parseError: any) {
      console.error('[Gemini] ❌ Failed to parse content as JSON')
      console.error('[Gemini] Parse error:', parseError.message)
      console.error('[Gemini] Content was:', content)
      return c.json({ 
        error: 'Failed to parse Gemini response as JSON',
        details: parseError.message,
        raw_content: content,
        supplier_name: null,
        total_amount: null
      }, 200)
    }
    
  } catch (e: any) {
    console.error('=== GEMINI ANALYZE WORKER CRASH ===')
    console.error('[Gemini] Error message:', e.message)
    console.error('[Gemini] Error stack:', e.stack)
    console.error('[Gemini] Error name:', e.name)
    return c.json({ 
      error: 'Worker Crash', 
      details: e.message,
      stack: e.stack,
      error_name: e.name,
      supplier_name: null,
      total_amount: null
    }, 500)
  }
})

// DEBUG ENDPOINT: Test ClickSend SMS Integration
app.get('/api/test-sms', async (c) => {
  console.log('=== CLICKSEND DEBUG TEST START ===')
  
  try {
    // Step 1: Check environment variables
    const clicksendUsername = c.env?.CLICKSEND_USERNAME
    const clicksendApiKey = c.env?.CLICKSEND_API_KEY
    const adminPhone = c.env?.ADMIN_PHONE_NUMBER
    
    console.log('[ClickSend Debug] Environment check:')
    console.log('[ClickSend Debug] - Username exists:', !!clicksendUsername)
    console.log('[ClickSend Debug] - API Key exists:', !!clicksendApiKey)
    console.log('[ClickSend Debug] - Admin Phone exists:', !!adminPhone)
    console.log('[ClickSend Debug] - Admin Phone value:', adminPhone || 'MISSING')
    
    if (!clicksendUsername || !clicksendApiKey || !adminPhone) {
      return c.json({
        error: 'Missing credentials',
        debug: {
          username_exists: !!clicksendUsername,
          api_key_exists: !!clicksendApiKey,
          admin_phone_exists: !!adminPhone,
          admin_phone_value: adminPhone || 'MISSING',
          available_env_keys: Object.keys(c.env || {})
        }
      }, 400)
    }
    
    // Step 2: Create Basic Auth credentials
    console.log('[ClickSend Debug] Creating Basic Auth credentials...')
    const credentials = btoa(`${clicksendUsername}:${clicksendApiKey}`)
    console.log('[ClickSend Debug] Credentials created (length):', credentials.length)
    
    // Step 3: Prepare test SMS payload
    const testMessage = 'Hello from Invoice App! 📱 This is a test message from ClickSend API.'
    console.log('[ClickSend Debug] Test message:', testMessage)
    console.log('[ClickSend Debug] Sending to:', adminPhone)
    
    const payload = {
      messages: [
        {
          source: 'invoice-app-debug',
          body: testMessage,
          to: adminPhone
        }
      ]
    }
    
    console.log('[ClickSend Debug] Payload:', JSON.stringify(payload, null, 2))
    
    // Step 4: Send request to ClickSend API
    console.log('[ClickSend Debug] Sending request to ClickSend API...')
    const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    })
    
    console.log('[ClickSend Debug] Response status:', response.status)
    console.log('[ClickSend Debug] Response status text:', response.statusText)
    
    // Step 5: Parse response body
    const responseText = await response.text()
    console.log('[ClickSend Debug] Raw response:', responseText)
    
    let responseBody
    try {
      responseBody = JSON.parse(responseText)
    } catch (e) {
      responseBody = { raw_text: responseText }
    }
    
    // Step 6: Return FULL response to user
    console.log('=== CLICKSEND DEBUG TEST END ===')
    
    return c.json({
      test_status: response.ok ? 'SUCCESS' : 'FAILED',
      http_status: response.status,
      http_status_text: response.statusText,
      clicksend_response: responseBody,
      debug_info: {
        phone_number_used: adminPhone,
        message_sent: testMessage,
        credentials_length: credentials.length,
        api_endpoint: 'https://rest.clicksend.com/v3/sms/send'
      }
    }, response.status)
    
  } catch (error: any) {
    console.error('[ClickSend Debug] CRITICAL ERROR:', error.message, error.stack)
    return c.json({
      error: 'Debug test failed',
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    }, 500)
  }
})

// ====== ORGANIZATION MANAGEMENT ENDPOINTS ======

// Get user's organizations
app.get('/api/organizations', async (c) => {
  try {
    console.log('[Organizations] ========== START ==========')
    console.log('[Organizations] Timestamp:', new Date().toISOString())
    
    // Debug environment variables
    console.log('[Organizations] Environment Check:')
    console.log('[Organizations]   SUPABASE_URL:', c.env?.SUPABASE_URL ? 'Present' : 'Missing')
    console.log('[Organizations]   SUPABASE_ANON_KEY:', c.env?.SUPABASE_ANON_KEY ? 'Present' : 'Missing')
    
    const authHeader = c.req.header('Authorization')
    console.log('[Organizations] Authorization header present:', !!authHeader)
    
    if (!authHeader) {
      console.error('[Organizations] ❌ Missing Authorization header')
      return c.json({ 
        success: false,
        error: 'Unauthorized' 
      }, 401)
    }
    
    const token = authHeader.replace('Bearer ', '')
    console.log('[Organizations] Token length:', token.length)
    
    const supabaseUrl = c.env?.SUPABASE_URL || 'https://dmnxblcdaqnenggfyurw.supabase.co'
    const supabaseAnonKey = c.env?.SUPABASE_ANON_KEY || 'missing'
    
    if (supabaseAnonKey === 'missing') {
      console.error('[Organizations] ❌ CRITICAL: SUPABASE_ANON_KEY is missing')
      return c.json({ 
        success: false,
        error: 'Configuration error - Missing Supabase credentials'
      }, 500)
    }
    
    // Create Supabase client with user's token for RLS
    console.log('[Organizations] Creating Supabase client...')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    })
    
    console.log('[Organizations] Verifying user token...')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError) {
      console.error('[Organizations] ❌ Auth error:', authError.message)
      console.error('[Organizations] Auth error details:', JSON.stringify(authError))
      return c.json({ 
        success: false,
        error: 'Unauthorized',
        details: authError.message 
      }, 401)
    }
    
    if (!user) {
      console.error('[Organizations] ❌ No user returned from auth')
      return c.json({ 
        success: false,
        error: 'Unauthorized' 
      }, 401)
    }
    
    console.log('[Organizations] ✓ User verified:', user.id)
    console.log('[Organizations] User email:', user.email)
    
    // Fetch organizations via organization_members join
    console.log('[Organizations] Fetching organizations for user...')
    const { data: memberships, error: fetchError } = await supabase
      .from('organization_members')
      .select(`
        role,
        organizations (
          id,
          name,
          tax_id,
          created_at
        )
      `)
      .eq('user_id', user.id)
    
    if (fetchError) {
      console.error('[Organizations] ❌ Fetch error:', fetchError.message)
      console.error('[Organizations] Error code:', fetchError.code)
      console.error('[Organizations] Error hint:', fetchError.hint)
      console.error('[Organizations] Full error:', JSON.stringify(fetchError))
      return c.json({ 
        success: false,
        error: 'Failed to fetch organizations', 
        details: fetchError.message,
        code: fetchError.code,
        hint: fetchError.hint
      }, 500)
    }
    
    // Transform data to include role
    const organizations = (memberships || []).map(m => ({
      id: m.organizations.id,
      name: m.organizations.name,
      tax_id: m.organizations.tax_id,
      created_at: m.organizations.created_at,
      role: m.role
    }))
    
    console.log('[Organizations] ✓ Found', organizations.length, 'organizations')
    console.log('[Organizations] ========== SUCCESS ==========')
    
    return c.json({ organizations })
    
  } catch (error: any) {
    // CRITICAL: Verbose error logging
    console.error('[Organizations] ========== CRITICAL ERROR ==========')
    console.error('[Organizations] Error type:', error.constructor.name)
    console.error('[Organizations] Error message:', error.message)
    console.error('[Organizations] Error stack:', error.stack)
    console.error('[Organizations] Error toString:', error.toString())
    console.error('[Organizations] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error('[Organizations] ========== END ERROR ==========')
    
    return c.json({ 
      success: false,
      error: error.message || 'Internal server error',
      stack: error.stack,
      details: error.toString(),
      type: error.constructor.name,
      full_error: JSON.stringify(error, Object.getOwnPropertyNames(error))
    }, 500)
  }
})

// Create new organization
app.post('/api/organizations/create', async (c) => {
  try {
    console.log('[Create Organization] ========== START ==========')
    console.log('[Create Organization] Timestamp:', new Date().toISOString())
    
    // Debug environment variables (CRITICAL - DO NOT LOG ACTUAL VALUES)
    console.log('[Create Organization] Environment Check:')
    console.log('[Create Organization]   SUPABASE_URL:', c.env?.SUPABASE_URL ? 'Present' : 'Missing')
    console.log('[Create Organization]   SUPABASE_ANON_KEY:', c.env?.SUPABASE_ANON_KEY ? 'Present' : 'Missing')
    console.log('[Create Organization]   Available env keys:', Object.keys(c.env || {}).join(', '))
    
    const authHeader = c.req.header('Authorization')
    console.log('[Create Organization] Authorization header present:', !!authHeader)
    
    if (!authHeader) {
      console.error('[Create Organization] ❌ Missing Authorization header')
      return c.json({ 
        success: false,
        error: 'Unauthorized - Missing Authorization header' 
      }, 401)
    }
    
    const body = await c.req.json()
    const { name, tax_id } = body
    console.log('[Create Organization] Request body received:', { name: !!name, tax_id: !!tax_id })
    
    if (!name || !name.trim()) {
      return c.json({ 
        success: false,
        error: 'Organization name is required' 
      }, 400)
    }
    
    const token = authHeader.replace('Bearer ', '')
    console.log('[Create Organization] Token extracted, length:', token.length)
    console.log('[Create Organization] Token starts with:', token.substring(0, 10) + '...')
    
    const supabaseUrl = c.env?.SUPABASE_URL || 'https://dmnxblcdaqnenggfyurw.supabase.co'
    const supabaseAnonKey = c.env?.SUPABASE_ANON_KEY || 'missing'
    
    console.log('[Create Organization] Supabase URL:', supabaseUrl)
    console.log('[Create Organization] Anon key present:', supabaseAnonKey !== 'missing')
    console.log('[Create Organization] Anon key length:', supabaseAnonKey !== 'missing' ? supabaseAnonKey.length : 0)
    
    if (supabaseAnonKey === 'missing') {
      console.error('[Create Organization] ❌ CRITICAL: SUPABASE_ANON_KEY is missing from environment')
      return c.json({ 
        success: false,
        error: 'Configuration error - Missing Supabase credentials',
        details: 'SUPABASE_ANON_KEY not found in environment variables'
      }, 500)
    }
    
    // Create Supabase client with user's token for RLS
    console.log('[Create Organization] Creating Supabase client...')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    })
    console.log('[Create Organization] ✓ Supabase client created')
    
    console.log('[Create Organization] Verifying user token...')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError) {
      console.error('[Create Organization] ❌ Auth error:', authError.message)
      console.error('[Create Organization] Auth error code:', authError.code)
      console.error('[Create Organization] Auth error status:', authError.status)
      console.error('[Create Organization] Auth error details:', JSON.stringify(authError))
      return c.json({ 
        success: false,
        error: 'Unauthorized - Invalid token', 
        details: authError.message,
        code: authError.code,
        status: authError.status
      }, 401)
    }
    
    if (!user) {
      console.error('[Create Organization] ❌ No user returned from auth')
      return c.json({ 
        success: false,
        error: 'Unauthorized - No user found' 
      }, 401)
    }
    
    console.log('[Create Organization] ✓ User verified:', user.id)
    console.log('[Create Organization] User email:', user.email)
    console.log('[Create Organization] Creating organization:', name)
    console.log('[Create Organization] Tax ID:', tax_id || 'none')
    
    // Insert organization
    console.log('[Create Organization] Step 1: Inserting organization into database...')
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        tax_id: tax_id?.trim() || null
      })
      .select()
      .single()
    
    if (orgError) {
      console.error('[Create Organization] ❌ Organization insert error:', orgError.message)
      console.error('[Create Organization] Error code:', orgError.code)
      console.error('[Create Organization] Error hint:', orgError.hint)
      console.error('[Create Organization] Error details:', orgError.details)
      console.error('[Create Organization] Full error:', JSON.stringify(orgError))
      return c.json({ 
        success: false,
        error: 'Failed to create organization', 
        details: orgError.message,
        code: orgError.code,
        hint: orgError.hint,
        supabase_details: orgError.details
      }, 500)
    }
    
    console.log('[Create Organization] ✓ Organization created successfully')
    console.log('[Create Organization] Organization ID:', organization.id)
    console.log('[Create Organization] Organization name:', organization.name)
    
    // Add user as owner
    console.log('[Create Organization] Step 2: Adding user as owner...')
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner'
      })
    
    if (memberError) {
      console.error('[Create Organization] ❌ Member insert error:', memberError.message)
      console.error('[Create Organization] Error code:', memberError.code)
      console.error('[Create Organization] Error hint:', memberError.hint)
      console.error('[Create Organization] Error details:', memberError.details)
      console.error('[Create Organization] Full error:', JSON.stringify(memberError))
      
      // Try to clean up the organization
      console.log('[Create Organization] Attempting cleanup of organization:', organization.id)
      await supabase.from('organizations').delete().eq('id', organization.id)
      
      return c.json({ 
        success: false,
        error: 'Failed to add user to organization', 
        details: memberError.message,
        code: memberError.code,
        hint: memberError.hint,
        supabase_details: memberError.details
      }, 500)
    }
    
    console.log('[Create Organization] ✓ User added as owner successfully')
    console.log('[Create Organization] ========== SUCCESS ==========')
    
    return c.json({ 
      success: true,
      organization: {
        ...organization,
        role: 'owner'
      }
    })
    
  } catch (error: any) {
    // CRITICAL: Verbose error logging
    console.error('[Create Organization] ========== CRITICAL ERROR ==========')
    console.error('[Create Organization] Error type:', error.constructor.name)
    console.error('[Create Organization] Error message:', error.message)
    console.error('[Create Organization] Error stack:', error.stack)
    console.error('[Create Organization] Error toString:', error.toString())
    console.error('[Create Organization] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error('[Create Organization] ========== END ERROR ==========')
    
    return c.json({ 
      success: false,
      error: error.message || 'Internal server error',
      stack: error.stack,
      details: error.toString(),
      type: error.constructor.name,
      full_error: JSON.stringify(error, Object.getOwnPropertyNames(error))
    }, 500)
  }
})

// Upload and process invoice - MANUAL ENTRY MODE
// Get all invoices for the current user
app.get('/api/invoices', async (c) => {
  try {
    console.log('[Invoices List] Fetching invoices for user')
    
    // Get auth token from header
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      console.error('[Invoices List] No Authorization header')
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    // Create Supabase client with service role key
    const supabaseUrl = 'https://dmnxblcdaqnenggfyurw.supabase.co'
    const supabaseServiceKey = c.env?.SUPABASE_SERVICE_KEY || 'missing'
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Verify user with auth token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('[Invoices List] Auth failed:', authError)
      return c.json({ error: 'Unauthorized', details: authError?.message }, 401)
    }
    
    console.log('[Invoices List] User verified:', user.id)
    
    // Fetch invoices for this user
    const { data: invoices, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    
    if (fetchError) {
      console.error('[Invoices List] Fetch error:', fetchError)
      return c.json({ error: 'Failed to fetch invoices', details: fetchError.message }, 500)
    }
    
    console.log('[Invoices List] Found', invoices?.length || 0, 'invoices')
    
    return c.json({ invoices: invoices || [] })
    
  } catch (error: any) {
    console.error('[Invoices List] Error:', error.message)
    return c.json({ error: 'Internal server error', details: error.message }, 500)
  }
})

// Upload and process invoice - MANUAL ENTRY MODE
app.post('/api/invoices/upload', async (c) => {
  try {
    console.log('[Invoice Upload] Step 1: Starting MANUAL ENTRY upload')
    
    console.log('[Invoice Upload] Step 2: Parsing JSON body')
    const body = await c.req.json()
    const fileName = body.fileName || 'invoice.pdf'
    const userId = body.userId
    const fileData = body.fileData  // base64 data URL
    const supplierName = body.supplierName  // MANUAL INPUT from user
    const totalAmount = body.totalAmount    // MANUAL INPUT from user
    
    console.log('[Invoice Upload] Step 3: User ID from request:', userId)
    console.log('[Invoice Upload] File name:', fileName)
    console.log('[Invoice Upload] Supplier name (manual):', supplierName)
    console.log('[Invoice Upload] Total amount (manual):', totalAmount)
    console.log('[Invoice Upload] File data type:', typeof fileData)
    
    if (!userId) {
      console.error('[Invoice Upload] No userId in request body')
      return c.json({ error: 'User ID is required' }, 400)
    }
    
    if (!fileData) {
      console.error('[Invoice Upload] No file data in request body')
      return c.json({ error: 'File data is required' }, 400)
    }
    
    if (!supplierName || !supplierName.trim()) {
      console.error('[Invoice Upload] No supplier name in request body')
      return c.json({ error: 'Supplier name is required' }, 400)
    }
    
    if (!totalAmount || totalAmount <= 0) {
      console.error('[Invoice Upload] Invalid total amount in request body')
      return c.json({ error: 'Valid total amount is required' }, 400)
    }
    
    console.log('[Invoice Upload] Step 4: Creating Supabase client with SERVICE ROLE KEY')
    const supabaseUrl = 'https://dmnxblcdaqnenggfyurw.supabase.co'
    const supabaseServiceKey = c.env?.SUPABASE_SERVICE_KEY || 'missing'
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log('[Invoice Upload] Service role client created')

    // Convert base64 data URL to ArrayBuffer for Cloudflare Workers
    console.log('[Invoice Upload] Step 5: Converting base64 to ArrayBuffer')
    
    // Extract base64 data from data URL (e.g., "data:image/png;base64,...")
    const base64Data = fileData.split(',')[1]
    if (!base64Data) {
      console.error('[Invoice Upload] Invalid file data format')
      return c.json({ error: 'Invalid file data format' }, 400)
    }
    
    // Decode base64 to binary string
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    console.log('[Invoice Upload] File size:', bytes.length, 'bytes')
    
    // Get content type from data URL
    const contentTypeMatch = fileData.match(/data:([^;]+);/)
    const contentType = contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream'
    console.log('[Invoice Upload] Content type:', contentType)
    
    // Extract file extension from original filename or content type
    console.log('[Invoice Upload] Step 6: Sanitizing filename')
    console.log('[Invoice Upload] Original filename:', fileName)
    
    let fileExtension = 'bin'
    
    // Try to get extension from original filename
    if (fileName && fileName.includes('.')) {
      const parts = fileName.split('.')
      fileExtension = parts[parts.length - 1].toLowerCase()
      console.log('[Invoice Upload] Extension from filename:', fileExtension)
    } else {
      // Fallback: get extension from content type
      const typeMap = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
      }
      fileExtension = typeMap[contentType] || 'bin'
      console.log('[Invoice Upload] Extension from content type:', fileExtension)
    }
    
    // Generate SAFE filename with ASCII characters only (no Hebrew, no spaces)
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)
    const safeFileName = `${timestamp}_${randomId}.${fileExtension}`
    console.log('[Invoice Upload] Safe filename:', safeFileName)

    // Upload to Supabase Storage with SAFE filename
    console.log('[Invoice Upload] Step 7: Uploading to Supabase Storage with safe filename')
    const storagePath = `${userId}/${safeFileName}`
    console.log('[Invoice Upload] Storage path:', storagePath)
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(storagePath, bytes, {
        contentType: contentType,
        upsert: false
      })
    
    if (uploadError) {
      console.error('[Invoice Upload] Storage upload failed:', uploadError)
      console.error('[Invoice Upload] Upload error details:', {
        message: uploadError.message,
        statusCode: uploadError.statusCode
      })
      return c.json({ 
        error: 'Storage upload failed', 
        details: uploadError.message
      }, 500)
    }
    
    console.log('[Invoice Upload] Storage upload success:', uploadData.path)
    
    // Construct public URL with SAFE filename
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/invoices/${storagePath}`
    console.log('[Invoice Upload] Step 8: Public URL:', publicUrl)

    // Use MANUAL INPUT (no mock data)
    console.log('[Invoice Upload] Step 9: Using MANUAL INPUT (no mock data)')
    console.log('[Invoice Upload] User provided:', { supplier_name: supplierName, total_amount: totalAmount })

    // Insert into database with REAL file URL and MANUAL DATA
    console.log('[Invoice Upload] Step 10: Inserting into database with REAL file URL and MANUAL data')
    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        supplier_name: supplierName.trim(),  // USER INPUT (not mock)
        total_amount: totalAmount,            // USER INPUT (not mock)
        file_url: publicUrl,                  // REAL URL from storage
        status: 'processed'
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Invoice Upload] Database insert failed:', insertError)
      console.error('[Invoice Upload] Insert error details:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      })
      return c.json({ 
        error: 'Database insert failed', 
        details: insertError.message,
        code: insertError.code
      }, 500)
    }

    console.log('[Invoice Upload] Step 11: SUCCESS! Invoice created:', invoice.id)
    console.log('[Invoice Upload] File URL in database:', invoice.file_url)
    console.log('[Invoice Upload] Supplier in database:', invoice.supplier_name)
    console.log('[Invoice Upload] Amount in database:', invoice.total_amount)
    
    // Step 12: Send SMS notification via ClickSend (fire and forget)
    console.log('[Invoice Upload] Step 12: Sending SMS notification via ClickSend')
    try {
      const clicksendUsername = c.env?.CLICKSEND_USERNAME
      const clicksendApiKey = c.env?.CLICKSEND_API_KEY
      const adminPhone = c.env?.ADMIN_PHONE_NUMBER
      
      if (clicksendUsername && clicksendApiKey && adminPhone) {
        console.log('[ClickSend] Credentials found, sending SMS...')
        
        // Create Basic Auth credentials (base64 encoded username:api_key)
        const credentials = btoa(`${clicksendUsername}:${clicksendApiKey}`)
        
        const smsBody = `New Invoice Uploaded! 📄\nSupplier: ${supplierName}\nAmount: ${totalAmount} ₪\nFile: ${invoice.file_url}`
        
        const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${credentials}`
          },
          body: JSON.stringify({
            messages: [
              {
                source: 'invoice-app',
                body: smsBody,
                to: adminPhone
              }
            ]
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('[ClickSend] SMS sent successfully:', data)
        } else {
          const errorText = await response.text()
          console.error('[ClickSend] SMS failed:', response.status, errorText)
        }
      } else {
        console.log('[ClickSend] Skipping SMS - missing credentials (username, api_key, or phone)')
      }
    } catch (smsError: any) {
      console.error('[ClickSend] SMS error (non-blocking):', smsError.message)
    }
    
    return c.json({ 
      success: true,
      invoice: invoice,
      storageUrl: publicUrl
    })
    
  } catch (error: any) {
    console.error('[Invoice Upload] CRITICAL ERROR:', error.message, error.stack)
    return c.json({ 
      error: 'Internal server error', 
      message: error.message,
      type: error.constructor.name
    }, 500)
  }
})

// Delete invoice
app.delete('/api/invoices/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const invoiceId = c.req.param('id')
    // No env needed - hardcoded credentials
    const supabase = createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[Delete Invoice] Error:', deleteError)
      return c.json({ error: 'Failed to delete invoice', details: deleteError.message }, 500)
    }

    return c.json({ success: true })
  } catch (error: any) {
    console.error('[Delete Invoice] Critical error:', error)
    return c.json({ error: 'Internal server error', details: error.message }, 500)
  }
})

// Main HTML page with inline React app
app.get('*', (c) => {
  // Get Supabase credentials from environment (required)
  const supabaseUrl = c.env?.SUPABASE_URL
  const supabaseAnonKey = c.env?.SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return c.text('Configuration error: Missing Supabase credentials', 500)
  }

  return c.html(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl" id="html-root">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>מעבד מסמכים חכם</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          window.__SUPABASE_URL__ = "${supabaseUrl}";
          window.__SUPABASE_ANON_KEY__ = "${supabaseAnonKey}";
        </script>
    </head>
    <body>
        <div id="root"></div>
        
        <!-- React and Supabase from CDN -->
        <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <script src="https://cdn.jsdelivr.net/npm/i18next@23/dist/umd/i18next.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/react-i18next@13/dist/umd/react-i18next.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/i18next-http-backend@2/i18nextHttpBackend.min.js"></script>
        
        <!-- Inline React Application -->
        <script type="module">
          const { useState, useEffect, createElement: h } = React;
          const { createClient } = supabase;
          const { useTranslation, I18nextProvider } = ReactI18next;
          
          // Initialize i18next
          i18next
            .use(i18nextHttpBackend)
            .init({
              lng: 'he', // Default to Hebrew
              fallbackLng: 'en',
              debug: false,
              backend: {
                loadPath: '/locales/{{lng}}/translation.json'
              },
              interpolation: {
                escapeValue: false
              }
            });
          
          // Create Supabase client with hardcoded credentials
          const supabaseClient = createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__);
          
          // Landing Page Component
          function Landing({ onGetStarted }) {
            return h('div', { className: 'min-h-screen bg-white' },
              h('div', { className: 'relative overflow-hidden' },
                h('div', { className: 'absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50' }),
                h('div', { className: 'relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24' },
                  h('div', { className: 'text-center' },
                    h('h1', { className: 'text-5xl md:text-6xl font-bold text-gray-900 mb-6' },
                      'Process Documents with ',
                      h('span', { className: 'text-indigo-600' }, 'AI-Powered OCR')
                    ),
                    h('p', { className: 'text-xl text-gray-600 mb-8 max-w-3xl mx-auto' },
                      'Transform your document workflow with intelligent OCR processing. Upload, process, and manage your documents in seconds.'
                    ),
                    h('button', {
                      onClick: onGetStarted,
                      className: 'inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white text-lg font-semibold rounded-xl hover:bg-indigo-700 transition shadow-lg hover:shadow-xl'
                    }, 'Get Started Free →')
                  ),
                  h('div', { className: 'mt-24 grid md:grid-cols-3 gap-8' },
                    h('div', { className: 'bg-white p-8 rounded-2xl shadow-lg border border-gray-100' },
                      h('div', { className: 'w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4' }, '📄'),
                      h('h3', { className: 'text-xl font-semibold text-gray-900 mb-2' }, 'Document Management'),
                      h('p', { className: 'text-gray-600' }, 'Upload and organize your documents in one secure place. Track processing status in real-time.')
                    ),
                    h('div', { className: 'bg-white p-8 rounded-2xl shadow-lg border border-gray-100' },
                      h('div', { className: 'w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4' }, '⚡'),
                      h('h3', { className: 'text-xl font-semibold text-gray-900 mb-2' }, 'Lightning Fast OCR'),
                      h('p', { className: 'text-gray-600' }, 'Advanced OCR technology processes your documents in seconds with high accuracy.')
                    ),
                    h('div', { className: 'bg-white p-8 rounded-2xl shadow-lg border border-gray-100' },
                      h('div', { className: 'w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4' }, '🛡️'),
                      h('h3', { className: 'text-xl font-semibold text-gray-900 mb-2' }, 'Secure & Private'),
                      h('p', { className: 'text-gray-600' }, 'Your documents are encrypted and stored securely. We never share your data with third parties.')
                    )
                  )
                )
              ),
              h('div', { className: 'bg-indigo-600 py-16' },
                h('div', { className: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center' },
                  h('h2', { className: 'text-3xl font-bold text-white mb-4' }, 'Ready to transform your document workflow?'),
                  h('p', { className: 'text-indigo-100 text-lg mb-8' }, 'Join thousands of users who trust us with their documents'),
                  h('button', {
                    onClick: onGetStarted,
                    className: 'inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-600 text-lg font-semibold rounded-xl hover:bg-gray-50 transition shadow-lg'
                  }, 'Start Processing Now →')
                )
              )
            );
          }
          
          // Auth Component  
          function Auth({ onAuth }) {
            const [isSignUp, setIsSignUp] = useState(false);
            const [email, setEmail] = useState('');
            const [password, setPassword] = useState('');
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');
            const [awaitingVerification, setAwaitingVerification] = useState(false);
            const [verificationEmail, setVerificationEmail] = useState('');
            
            const handleSubmit = async (e) => {
              e.preventDefault();
              setError('');
              setLoading(true);
              try {
                const result = await onAuth(email, password, isSignUp);
                
                // Check if email verification is required
                if (result && result.requiresVerification) {
                  console.log('[Auth] Email verification required');
                  setAwaitingVerification(true);
                  setVerificationEmail(email);
                }
              } catch (err) {
                setError(err.message || 'Authentication failed');
              } finally {
                setLoading(false);
              }
            };
            
            // If awaiting email verification, show success message
            if (awaitingVerification) {
              return h('div', { className: 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4' },
                h('div', { className: 'max-w-md w-full bg-white rounded-2xl shadow-xl p-8' },
                  h('div', { className: 'text-center' },
                    h('div', { className: 'inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6 text-5xl' }, '✉️'),
                    h('h1', { className: 'text-3xl font-bold text-gray-900 mb-4' }, 'Verify your email'),
                    h('p', { className: 'text-gray-600 mb-2' }, 'We sent a confirmation link to:'),
                    h('p', { className: 'text-indigo-600 font-medium mb-6' }, verificationEmail),
                    h('div', { className: 'bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6' },
                      h('p', { className: 'text-sm text-blue-800' }, '📧 Please check your inbox and click the link to activate your account.')
                    ),
                    h('button', {
                      onClick: () => {
                        setAwaitingVerification(false);
                        setIsSignUp(false);
                        setEmail('');
                        setPassword('');
                        setError('');
                      },
                      className: 'w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition'
                    }, 'Back to Login')
                  )
                )
              );
            }
            
            return h('div', { className: 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4' },
              h('div', { className: 'max-w-md w-full bg-white rounded-2xl shadow-xl p-8' },
                h('div', { className: 'text-center mb-8' },
                  h('div', { className: 'inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4 text-3xl' }, isSignUp ? '✨' : '🔐'),
                  h('h1', { className: 'text-3xl font-bold text-gray-900' }, isSignUp ? 'Create Account' : 'Welcome Back'),
                  h('p', { className: 'text-gray-600 mt-2' }, isSignUp ? 'Sign up to start processing documents' : 'Sign in to your account')
                ),
                h('form', { onSubmit: handleSubmit, className: 'space-y-6' },
                  h('div', {},
                    h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Email'),
                    h('input', {
                      type: 'email',
                      required: true,
                      value: email,
                      onChange: (e) => setEmail(e.target.value),
                      className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                      placeholder: 'you@example.com'
                    })
                  ),
                  h('div', {},
                    h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Password'),
                    h('input', {
                      type: 'password',
                      required: true,
                      value: password,
                      onChange: (e) => setPassword(e.target.value),
                      className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                      placeholder: '••••••••',
                      minLength: 6
                    })
                  ),
                  error && h('div', { className: 'bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm' }, error),
                  h('button', {
                    type: 'submit',
                    disabled: loading,
                    className: 'w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed'
                  }, loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In'))
                ),
                h('div', { className: 'mt-6 text-center' },
                  h('button', {
                    onClick: () => { setIsSignUp(!isSignUp); setError(''); },
                    className: 'text-indigo-600 hover:text-indigo-700 font-medium'
                  }, isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up")
                )
              )
            );
          }
          
          // ====== MULTI-TENANT ORGANIZATION SYSTEM ======
          
          // Organization Context
          const OrganizationContext = React.createContext(null);
          
          function OrganizationProvider({ children, user }) {
            const [organizations, setOrganizations] = useState([]);
            const [currentOrg, setCurrentOrg] = useState(null);
            const [loading, setLoading] = useState(true);
            const [showCreateModal, setShowCreateModal] = useState(false);
            
            // Fetch user's organizations on mount
            useEffect(() => {
              if (!user) return;
              
              const fetchOrganizations = async () => {
                try {
                  console.log('[Organizations] Fetching for user:', user.id);
                  
                  const { data: session } = await supabaseClient.auth.getSession();
                  const token = session?.session?.access_token;
                  
                  if (!token) {
                    console.error('[Organizations] No auth token');
                    setLoading(false);
                    return;
                  }
                  
                  // Fetch organizations via API
                  const response = await fetch('/api/organizations', {
                    headers: { 'Authorization': 'Bearer ' + token }
                  });
                  
                  if (response.ok) {
                    const data = await response.json();
                    console.log('[Organizations] Fetched:', data.organizations?.length || 0);
                    setOrganizations(data.organizations || []);
                    
                    // If no organizations, show create modal
                    if (!data.organizations || data.organizations.length === 0) {
                      console.log('[Organizations] No organizations found, showing create modal');
                      setShowCreateModal(true);
                    } else {
                      // Set first org as current
                      setCurrentOrg(data.organizations[0]);
                    }
                  } else {
                    console.error('[Organizations] Failed to fetch:', response.status);
                  }
                } catch (error) {
                  console.error('[Organizations] Error:', error);
                } finally {
                  setLoading(false);
                }
              };
              
              fetchOrganizations();
            }, [user]);
            
            const value = {
              organizations,
              currentOrg,
              setCurrentOrg,
              loading,
              showCreateModal,
              setShowCreateModal,
              refreshOrganizations: async () => {
                // Re-fetch organizations
                setLoading(true);
                const { data: session } = await supabaseClient.auth.getSession();
                const token = session?.session?.access_token;
                if (token) {
                  const response = await fetch('/api/organizations', {
                    headers: { 'Authorization': 'Bearer ' + token }
                  });
                  if (response.ok) {
                    const data = await response.json();
                    setOrganizations(data.organizations || []);
                    if (data.organizations && data.organizations.length > 0 && !currentOrg) {
                      setCurrentOrg(data.organizations[0]);
                    }
                  }
                }
                setLoading(false);
              }
            };
            
            return h(OrganizationContext.Provider, { value }, children);
          }
          
          // Create Organization Modal
          function CreateOrganizationModal({ isOpen, onClose, onSuccess }) {
            const [orgName, setOrgName] = useState('');
            const [taxId, setTaxId] = useState('');
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');
            
            const handleSubmit = async (e) => {
              e.preventDefault();
              setError('');
              
              if (!orgName.trim()) {
                setError('Organization name is required');
                return;
              }
              
              setLoading(true);
              
              try {
                console.log('[Create Org] ========== START ==========');
                
                // Helper function to get fresh session with retry logic
                const getFreshSession = async (retryCount = 0) => {
                  console.log('[Create Org] Fetching fresh session... (attempt ' + (retryCount + 1) + ')');
                  
                  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                  
                  if (sessionError) {
                    console.error('[Create Org] Session error:', sessionError);
                    throw new Error('Failed to get session: ' + sessionError.message);
                  }
                  
                  if (!session || !session.access_token) {
                    console.warn('[Create Org] No session/token found on attempt ' + (retryCount + 1));
                    
                    // If first attempt failed, retry once after 1 second
                    if (retryCount === 0) {
                      console.log('[Create Org] Retrying authentication in 1 second...');
                      setError('Retrying authentication...');
                      
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      return getFreshSession(1); // Recursive retry
                    }
                    
                    // Second attempt also failed
                    throw new Error('No active session. Please sign in again.');
                  }
                  
                  console.log('[Create Org] ✓ Session obtained');
                  console.log('[Create Org] Token length:', session.access_token.length);
                  console.log('[Create Org] Token type:', typeof session.access_token);
                  console.log('[Create Org] User ID:', session.user?.id);
                  console.log('[Create Org] User email:', session.user?.email);
                  
                  return session;
                };
                
                // Force fetch the latest session with retry logic
                const session = await getFreshSession();
                const token = session.access_token;
                
                // Clear retry message
                setError('');
                
                console.log('[Create Org] Making API request with fresh token...');
                console.log('[Create Org] Organization name:', orgName.trim());
                console.log('[Create Org] Tax ID:', taxId.trim() || 'none');
                
                const response = await fetch('/api/organizations/create', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  },
                  body: JSON.stringify({
                    name: orgName.trim(),
                    tax_id: taxId.trim() || null
                  })
                });
                
                console.log('[Create Org] Response received, status:', response.status);
                
                if (response.ok) {
                  const data = await response.json();
                  console.log('[Create Org] ✓ SUCCESS - Organization created:', data.organization?.id);
                  console.log('[Create Org] ========== END ==========');
                  
                  setOrgName('');
                  setTaxId('');
                  onSuccess(data.organization);
                  onClose();
                } else {
                  const errorData = await response.json();
                  console.error('[Create Org] ❌ ERROR - Status:', response.status);
                  console.error('[Create Org] Error details:', errorData);
                  console.log('[Create Org] ========== END ==========');
                  
                  const errorMsg = (errorData.error || 'Failed to create organization') + ' (Status: ' + response.status + ')';
                  setError(errorMsg);
                }
              } catch (err) {
                console.error('[Create Org] ❌ EXCEPTION:', err);
                console.error('[Create Org] Exception details:', err?.message);
                console.log('[Create Org] ========== END ==========');
                
                setError(err?.message || 'Network error: Please try again');
              } finally {
                setLoading(false);
              }
            };
            
            if (!isOpen) return null;
            
            return h('div', { 
              className: 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4',
              onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
            },
              h('div', { className: 'bg-white rounded-2xl shadow-2xl max-w-md w-full p-8' },
                h('div', { className: 'text-center mb-6' },
                  h('div', { className: 'inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4 text-3xl' }, '🏢'),
                  h('h2', { className: 'text-2xl font-bold text-gray-900' }, 'Create Organization'),
                  h('p', { className: 'text-gray-600 mt-2' }, 'Set up your new organization to get started')
                ),
                
                h('form', { onSubmit: handleSubmit, className: 'space-y-4' },
                  h('div', {},
                    h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Organization Name *'),
                    h('input', {
                      type: 'text',
                      value: orgName,
                      onChange: (e) => setOrgName(e.target.value),
                      className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                      placeholder: 'My Company Ltd.',
                      required: true
                    })
                  ),
                  
                  h('div', {},
                    h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Tax ID (Optional)'),
                    h('input', {
                      type: 'text',
                      value: taxId,
                      onChange: (e) => setTaxId(e.target.value),
                      className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                      placeholder: '123456789'
                    })
                  ),
                  
                  error && h('div', { className: 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg' }, error),
                  
                  h('div', { className: 'flex gap-3 pt-4' },
                    h('button', {
                      type: 'button',
                      onClick: onClose,
                      className: 'flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition',
                      disabled: loading
                    }, 'Cancel'),
                    h('button', {
                      type: 'submit',
                      className: 'flex-1 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50',
                      disabled: loading
                    }, loading ? 'Creating...' : 'Create Organization')
                  )
                )
              )
            );
          }
          
          // Language Switcher Component
          function LanguageSwitcher() {
            const { i18n } = useTranslation();
            const [currentLang, setCurrentLang] = useState(i18n.language || 'he');
            
            const toggleLanguage = () => {
              const newLang = currentLang === 'he' ? 'en' : 'he';
              i18n.changeLanguage(newLang);
              setCurrentLang(newLang);
              
              // Update HTML dir and lang attributes
              const htmlRoot = document.getElementById('html-root');
              if (htmlRoot) {
                htmlRoot.setAttribute('lang', newLang);
                htmlRoot.setAttribute('dir', newLang === 'he' ? 'rtl' : 'ltr');
              }
            };
            
            return h('button', {
              onClick: toggleLanguage,
              className: 'p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition flex items-center gap-2 text-sm font-medium',
              title: currentLang === 'he' ? 'Switch to English' : 'עבור לעברית'
            },
              h('span', { className: 'text-lg' }, currentLang === 'he' ? '🇮🇱' : '🇺🇸'),
              h('span', {}, currentLang === 'he' ? 'עברית' : 'English')
            );
          }
          
          // App Layout with Sidebar
          function AppLayout({ children, user, onSignOut }) {
            const { t } = useTranslation();
            const orgContext = React.useContext(OrganizationContext);
            const [isSidebarOpen, setIsSidebarOpen] = useState(true);
            const [currentView, setCurrentView] = useState('dashboard');
            
            if (!orgContext) {
              return h('div', { className: 'min-h-screen flex items-center justify-center' },
                h('div', { className: 'text-gray-600' }, 'Loading organizations...')
              );
            }
            
            const { organizations, currentOrg, setCurrentOrg, loading, showCreateModal, setShowCreateModal, refreshOrganizations } = orgContext;
            
            if (loading) {
              return h('div', { className: 'min-h-screen flex items-center justify-center bg-gray-50' },
                h('div', { className: 'text-center' },
                  h('div', { className: 'text-4xl mb-4' }, '⏳'),
                  h('div', { className: 'text-gray-600 text-lg' }, 'Loading your workspace...')
                )
              );
            }
            
            const handleCreateOrgSuccess = (newOrg) => {
              setCurrentOrg(newOrg);
              refreshOrganizations();
            };
            
            return h('div', { className: 'min-h-screen bg-gray-50 flex' },
              // Sidebar (RTL-aware: will flip to right side automatically)
              h('div', { 
                className: 'fixed inset-y-0 start-0 w-64 bg-white border-e border-gray-200 flex flex-col shadow-lg z-40',
                style: { transition: 'transform 0.3s ease' }
              },
                // Top: Organization Switcher + Language Switcher
                h('div', { className: 'p-4 border-b border-gray-200' },
                  h('div', { className: 'flex items-center gap-3 mb-2' },
                    h('div', { className: 'w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-xl font-bold text-indigo-600' },
                      currentOrg?.name?.charAt(0) || '🏢'
                    ),
                    h('div', { className: 'flex-1 min-w-0' },
                      h('div', { className: 'font-semibold text-gray-900 truncate' }, currentOrg?.name || t('sidebar.noOrganization')),
                      h('div', { className: 'text-xs text-gray-500' }, organizations.length + ' ' + t('sidebar.organizations'))
                    )
                  ),
                  
                  // Language Switcher
                  h('div', { className: 'mb-2' }, h(LanguageSwitcher)),
                  
                  // Organization Dropdown
                  organizations.length > 1 && h('select', {
                    value: currentOrg?.id || '',
                    onChange: (e) => {
                      const selected = organizations.find(org => org.id === e.target.value);
                      if (selected) setCurrentOrg(selected);
                    },
                    className: 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                  },
                    organizations.map(org => 
                      h('option', { key: org.id, value: org.id }, org.name)
                    )
                  ),
                  
                  // Create New Organization Button
                  h('button', {
                    onClick: () => setShowCreateModal(true),
                    className: 'w-full mt-2 px-3 py-2 text-sm bg-indigo-50 text-indigo-600 font-medium rounded-lg hover:bg-indigo-100 transition flex items-center justify-center gap-2'
                  }, '+ ' + t('sidebar.createOrganization'))
                ),
                
                // Middle: Navigation Menu
                h('nav', { className: 'flex-1 p-4 space-y-1 overflow-y-auto' },
                  h('a', {
                    href: '#',
                    onClick: (e) => { e.preventDefault(); setCurrentView('dashboard'); },
                    className: 'flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition ' + (currentView === 'dashboard' ? 'bg-indigo-50 text-indigo-600 font-medium' : '')
                  },
                    h('span', { className: 'text-xl' }, '📊'),
                    h('span', {}, t('navigation.dashboard'))
                  ),
                  
                  h('a', {
                    href: '#',
                    onClick: (e) => { e.preventDefault(); setCurrentView('invoices'); },
                    className: 'flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition ' + (currentView === 'invoices' ? 'bg-indigo-50 text-indigo-600 font-medium' : '')
                  },
                    h('span', { className: 'text-xl' }, '📄'),
                    h('span', {}, t('navigation.smartProcurement'))
                  ),
                  
                  h('a', {
                    href: '#',
                    onClick: (e) => { e.preventDefault(); setCurrentView('employees'); },
                    className: 'flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition ' + (currentView === 'employees' ? 'bg-indigo-50 text-indigo-600 font-medium' : '')
                  },
                    h('span', { className: 'text-xl' }, '👥'),
                    h('span', {}, t('navigation.employees')),
                    h('span', { className: 'ms-auto text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full' }, t('navigation.comingSoon'))
                  ),
                  
                  h('a', {
                    href: '#',
                    onClick: (e) => { e.preventDefault(); setCurrentView('settings'); },
                    className: 'flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition ' + (currentView === 'settings' ? 'bg-indigo-50 text-indigo-600 font-medium' : '')
                  },
                    h('span', { className: 'text-xl' }, '⚙️'),
                    h('span', {}, t('navigation.settings'))
                  )
                ),
                
                // Bottom: User Profile
                h('div', { className: 'p-4 border-t border-gray-200' },
                  h('div', { className: 'flex items-center gap-3 mb-3' },
                    h('div', { className: 'w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold' },
                      user?.email?.charAt(0).toUpperCase() || '👤'
                    ),
                    h('div', { className: 'flex-1 min-w-0' },
                      h('div', { className: 'font-medium text-gray-900 truncate text-sm' }, user?.email || 'User'),
                      h('div', { className: 'text-xs text-gray-500' }, t('profile.' + (currentOrg?.role || 'member')))
                    )
                  ),
                  h('button', {
                    onClick: onSignOut,
                    className: 'w-full px-4 py-2 text-sm bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition flex items-center justify-center gap-2'
                  }, '🚪 ' + t('common.logout'))
                )
              ),
              
              // Main Content Area (RTL-aware: margin flips automatically)
              h('div', { className: 'flex-1 ms-64' },
                h('div', { className: 'p-8' },
                  React.cloneElement(children, { currentView, setCurrentView, currentOrg })
                )
              ),
              
              // Create Organization Modal
              h(CreateOrganizationModal, {
                isOpen: showCreateModal,
                onClose: () => setShowCreateModal(false),
                onSuccess: handleCreateOrgSuccess
              })
            );
          }
          
          // Dashboard Component
          function Dashboard({ user, onSignOut, currentView, setCurrentView }) {
            // Use currentView from AppLayout instead of local activeTab
            const activeTab = currentView || 'dashboard';
            const [documents, setDocuments] = useState([]);
            const [invoices, setInvoices] = useState([]);
            const [loading, setLoading] = useState(true);
            const [showUpload, setShowUpload] = useState(false);
            const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
            const [showInvoiceModal, setShowInvoiceModal] = useState(false);
            const [selectedInvoice, setSelectedInvoice] = useState(null);
            const [newDocTitle, setNewDocTitle] = useState('');
            const [uploading, setUploading] = useState(false);
            const [processingId, setProcessingId] = useState(null);
            const [selectedFile, setSelectedFile] = useState(null);
            const [invoiceSupplier, setInvoiceSupplier] = useState('');
            const [invoiceAmount, setInvoiceAmount] = useState('');
            const [isAnalyzing, setIsAnalyzing] = useState(false);
            
            useEffect(() => {
              if (activeTab === 'documents' || activeTab === 'dashboard') {
                loadDocuments();
              } else if (activeTab === 'invoices') {
                loadInvoices();
              }
            }, [activeTab]);
            
            const loadDocuments = async () => {
              try {
                const { data: session } = await supabaseClient.auth.getSession();
                const token = session?.session?.access_token;
                if (!token) return;
                
                const response = await fetch('/api/documents', {
                  headers: { Authorization: 'Bearer ' + token }
                });
                if (response.ok) {
                  const data = await response.json();
                  setDocuments(data.documents || []);
                }
              } catch (error) {
                console.error('Failed to load documents:', error);
              } finally {
                setLoading(false);
              }
            };
            
            const loadInvoices = async () => {
              setLoading(true);
              try {
                const { data: session } = await supabaseClient.auth.getSession();
                const token = session?.session?.access_token;
                if (!token) return;
                
                const response = await fetch('/api/invoices', {
                  headers: { Authorization: 'Bearer ' + token }
                });
                if (response.ok) {
                  const data = await response.json();
                  setInvoices(data.invoices || []);
                }
              } catch (error) {
                console.error('Failed to load invoices:', error);
              } finally {
                setLoading(false);
              }
            };
            
            const handleFileSelect = async (e) => {
              console.log('[Invoice Upload] File selected:', e.target.files[0]?.name);
              if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                setSelectedFile(file);
                console.log('[Invoice Upload] File stored in state:', file.name);
                console.log('[Invoice Upload] File type:', file.type);
                
                // Auto-analyze with AI (Google Gemini 1.5 Flash - Native PDF Support)
                console.log('[Gemini Analyze] Starting automatic AI analysis');
                setIsAnalyzing(true);
                
                try {
                  // Read file as base64
                  const reader = new FileReader();
                  reader.onloadend = async () => {
                    console.log('[Gemini Analyze] File read complete, sending to Gemini');
                    console.log('[Gemini Analyze] File MIME type:', file.type);
                    console.log('[Gemini Analyze] Is PDF:', file.type === 'application/pdf');
                    
                    try {
                      const { data: session } = await supabaseClient.auth.getSession();
                      const token = session?.session?.access_token;
                      
                      const response = await fetch('/api/invoices/analyze', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: 'Bearer ' + token
                        },
                        body: JSON.stringify({ 
                          fileData: reader.result,
                          mimeType: file.type  // Send MIME type for Gemini
                        })
                      });
                      
                      console.log('[Gemini Analyze] API response status:', response.status);
                      
                      if (response.ok) {
                        const data = await response.json();
                        console.log('[Gemini Analyze] AI response:', data);
                        
                        if (data.supplier_name) {
                          setInvoiceSupplier(data.supplier_name);
                          console.log('[Gemini Analyze] Auto-filled supplier:', data.supplier_name);
                        }
                        
                        if (data.total_amount) {
                          setInvoiceAmount(data.total_amount.toString());
                          console.log('[Gemini Analyze] Auto-filled amount:', data.total_amount);
                        }
                        
                        if (data.success) {
                          alert('✓ AI Analysis Complete! Fields auto-filled. Please review and adjust if needed.');
                        } else {
                          alert('AI could not extract data. Please fill fields manually.');
                        }
                      } else {
                        const errorData = await response.json();
                        console.error('[Gemini Analyze] API error:', errorData);
                        alert('AI analysis failed: ' + (errorData.error || 'Unknown error'));
                      }
                    } catch (analyzeError) {
                      console.error('[Gemini Analyze] Error:', analyzeError);
                      alert('AI analysis failed. Please fill fields manually.');
                    } finally {
                      setIsAnalyzing(false);
                    }
                  };
                  
                  reader.onerror = () => {
                    console.error('[Gemini Analyze] FileReader error');
                    setIsAnalyzing(false);
                    alert('Failed to read file. Please try again.');
                  };
                  
                  reader.readAsDataURL(file);
                  
                } catch (error) {
                  console.error('[Gemini Analyze] Outer error:', error);
                  setIsAnalyzing(false);
                  alert('AI analysis failed. Please fill fields manually.');
                }
              }
            };
            
            const handleCancelInvoiceUpload = () => {
              console.log('[Invoice Upload] Cancel clicked - resetting form');
              setShowInvoiceUpload(false);
              setSelectedFile(null);
              setInvoiceSupplier('');
              setInvoiceAmount('');
            };
            
            const handleInvoiceUpload = async () => {
              console.log('[Invoice Upload] Upload button clicked');
              console.log('[Invoice Upload] Selected file:', selectedFile);
              console.log('[Invoice Upload] Supplier name:', invoiceSupplier);
              console.log('[Invoice Upload] Total amount:', invoiceAmount);
              
              if (!selectedFile) {
                console.error('[Invoice Upload] No file selected');
                alert('Please select a file first');
                return;
              }
              
              if (!invoiceSupplier.trim()) {
                console.error('[Invoice Upload] No supplier name');
                alert('Please enter supplier name');
                return;
              }
              
              if (!invoiceAmount || parseFloat(invoiceAmount) <= 0) {
                console.error('[Invoice Upload] Invalid amount');
                alert('Please enter a valid amount');
                return;
              }
              
              console.log('[Invoice Upload] Starting upload process...');
              setUploading(true);
              
              try {
                console.log('[Invoice Upload] Getting current user');
                const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
                
                if (userError || !user) {
                  console.error('[Invoice Upload] Failed to get user:', userError);
                  alert('Not authenticated. Please sign in.');
                  setUploading(false);
                  return;
                }
                
                console.log('[Invoice Upload] User ID:', user.id);
                console.log('[Invoice Upload] User email:', user.email);
                
                console.log('[Invoice Upload] Getting auth session');
                const { data: session } = await supabaseClient.auth.getSession();
                const token = session?.session?.access_token;
                console.log('[Invoice Upload] Token retrieved:', token ? 'Yes' : 'No');
                
                if (!token) {
                  console.error('[Invoice Upload] No auth token');
                  alert('Not authenticated. Please sign in.');
                  setUploading(false);
                  return;
                }
                
                console.log('[Invoice Upload] Reading file as base64');
                const reader = new FileReader();
                reader.onloadend = async () => {
                  console.log('[Invoice Upload] File read complete, sending to API');
                  
                  try {
                    const response = await fetch('/api/invoices/upload', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token
                      },
                      body: JSON.stringify({ 
                        fileName: selectedFile.name,
                        fileData: reader.result,
                        userId: user.id,
                        supplierName: invoiceSupplier.trim(),
                        totalAmount: parseFloat(invoiceAmount)
                      })
                    });
                    
                    console.log('[Invoice Upload] API response status:', response.status);
                    
                    if (response.ok) {
                      const data = await response.json();
                      console.log('[Invoice Upload] Success! Invoice data:', data);
                      setInvoices([data.invoice, ...invoices]);
                      handleCancelInvoiceUpload();
                      alert('Invoice uploaded successfully!');
                    } else {
                      const errorData = await response.json();
                      console.error('[Invoice Upload] API error:', errorData);
                      alert('Upload failed: ' + (errorData.error || 'Unknown error'));
                    }
                  } catch (fetchError) {
                    console.error('[Invoice Upload] Fetch error:', fetchError);
                    alert('Network error: ' + fetchError.message);
                  } finally {
                    setUploading(false);
                  }
                };
                
                reader.onerror = (error) => {
                  console.error('[Invoice Upload] FileReader error:', error);
                  alert('Failed to read file');
                  setUploading(false);
                };
                
                reader.readAsDataURL(selectedFile);
                
              } catch (error) {
                console.error('[Invoice Upload] Outer catch error:', error);
                alert('Failed to upload invoice: ' + error.message);
                setUploading(false);
              }
            };
            
            const handleViewInvoice = (invoice) => {
              setSelectedInvoice(invoice);
              setShowInvoiceModal(true);
            };
            
            const handleDownloadInvoice = (invoice) => {
              window.open(invoice.file_url, '_blank');
            };
            
            const formatDate = (dateString) => {
              const date = new Date(dateString);
              return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              });
            };
            
            const formatCurrency = (amount) => {
              return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(amount);
            };
            
            const handleUpload = async (e) => {
              e.preventDefault();
              if (!newDocTitle.trim()) return;
              setUploading(true);
              try {
                const { data: session } = await supabaseClient.auth.getSession();
                const token = session?.session?.access_token;
                const response = await fetch('/api/documents', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                  },
                  body: JSON.stringify({ title: newDocTitle })
                });
                if (response.ok) {
                  const data = await response.json();
                  setDocuments([data.document, ...documents]);
                  setNewDocTitle('');
                  setShowUpload(false);
                }
              } catch (error) {
                console.error('Failed to upload:', error);
              } finally {
                setUploading(false);
              }
            };
            
            const handleProcessOCR = async (documentId) => {
              setProcessingId(documentId);
              try {
                const response = await fetch('/api/process-ocr', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ documentId })
                });
                if (response.ok) {
                  const data = await response.json();
                  setDocuments(documents.map(doc => doc.id === documentId ? data.document : doc));
                }
              } catch (error) {
                console.error('Failed to process OCR:', error);
              } finally {
                setProcessingId(null);
              }
            };
            
            const getStatusIcon = (status) => {
              if (status === 'pending') return '⏱️';
              if (status === 'processing') return '⚙️';
              if (status === 'completed') return '✅';
              if (status === 'failed') return '❌';
              return '📄';
            };
            
            // Dashboard content without old sidebar (AppLayout provides the sidebar)
            return h('div', { className: 'min-h-screen bg-gray-50' },
              h('div', {},  // No padding needed, AppLayout handles layout
                h('header', { className: 'bg-white border-b border-gray-200 sticky top-0 z-40' },
                  h('div', { className: 'px-8 py-4 flex items-center justify-between' },
                    h('h1', { className: 'text-2xl font-bold text-gray-900' }, 
                      (activeTab === 'documents' || activeTab === 'dashboard') ? 'My Documents' : 'My Invoices'
                    ),
                    (activeTab === 'documents' || activeTab === 'dashboard') ? h('button', {
                      onClick: () => setShowUpload(true),
                      className: 'flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition'
                    }, '➕ Upload Document') : h('button', {
                      onClick: () => setShowInvoiceUpload(true),
                      className: 'flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition'
                    }, '➕ Upload Invoice')
                  )
                ),
                h('main', { className: 'p-8' },
                  loading ? h('div', { className: 'flex items-center justify-center py-12' }, '⏳ Loading...') :
                  (activeTab === 'documents' || activeTab === 'dashboard') ? (
                    documents.length === 0 ? h('div', { className: 'text-center py-12' },
                      h('div', { className: 'text-6xl mb-4' }, '📤'),
                      h('h3', { className: 'text-xl font-semibold text-gray-900 mb-2' }, 'No documents yet'),
                      h('p', { className: 'text-gray-600 mb-6' }, 'Upload your first document to get started'),
                      h('button', {
                        onClick: () => setShowUpload(true),
                        className: 'inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition'
                      }, '➕ Upload Document')
                    ) :
                    h('div', { className: 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' },
                      documents.map(doc => 
                        h('div', { key: doc.id, className: 'bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition' },
                          h('div', { className: 'flex items-start justify-between mb-4' },
                            h('div', { className: 'text-4xl' }, '📄'),
                            h('div', { className: 'text-2xl' }, getStatusIcon(doc.status))
                          ),
                          h('h3', { className: 'text-lg font-semibold text-gray-900 mb-2' }, doc.title),
                          h('p', { className: 'text-sm text-gray-600 mb-4' },
                            'Status: ',
                            h('span', { className: 'font-medium capitalize' }, doc.status)
                          ),
                          doc.content && h('p', { className: 'text-sm text-gray-700 mb-4 line-clamp-2' }, doc.content),
                          doc.status === 'pending' && h('button', {
                            onClick: () => handleProcessOCR(doc.id),
                            disabled: processingId === doc.id,
                            className: 'w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50'
                          }, processingId === doc.id ? '⚙️ Processing...' : '▶️ Process OCR')
                        )
                      )
                    )
                  ) : (
                    // Invoices Tab
                    invoices.length === 0 ? h('div', { className: 'text-center py-12' },
                      h('div', { className: 'text-6xl mb-4' }, '🧾'),
                      h('h3', { className: 'text-xl font-semibold text-gray-900 mb-2' }, 'No invoices yet'),
                      h('p', { className: 'text-gray-600 mb-6' }, 'Upload your first invoice to get started'),
                      h('button', {
                        onClick: () => setShowInvoiceUpload(true),
                        className: 'inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition'
                      }, '➕ Upload Invoice')
                    ) :
                    h('div', { className: 'bg-white rounded-lg border border-gray-200 overflow-hidden' },
                      h('table', { className: 'min-w-full divide-y divide-gray-200' },
                        h('thead', { className: 'bg-gray-50' },
                          h('tr', {},
                            h('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Date'),
                            h('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Supplier Name'),
                            h('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Total Amount'),
                            h('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Status'),
                            h('th', { className: 'px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Actions')
                          )
                        ),
                        h('tbody', { className: 'bg-white divide-y divide-gray-200' },
                          invoices.map(invoice =>
                            h('tr', { key: invoice.id, className: 'hover:bg-gray-50' },
                              h('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' }, formatDate(invoice.created_at)),
                              h('td', { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' }, invoice.supplier_name),
                              h('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' }, formatCurrency(invoice.total_amount)),
                              h('td', { className: 'px-6 py-4 whitespace-nowrap' },
                                h('span', { className: 'px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800' }, invoice.status)
                              ),
                              h('td', { className: 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium' },
                                h('button', {
                                  onClick: () => handleViewInvoice(invoice),
                                  className: 'text-indigo-600 hover:text-indigo-900 mr-4'
                                }, '👁️ View'),
                                h('button', {
                                  onClick: () => handleDownloadInvoice(invoice),
                                  className: 'text-green-600 hover:text-green-900'
                                }, '⬇️ Download')
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              ),
              showUpload && h('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4' },
                h('div', { className: 'bg-white rounded-2xl p-8 max-w-md w-full' },
                  h('h2', { className: 'text-2xl font-bold text-gray-900 mb-6' }, 'Upload Document'),
                  h('form', { onSubmit: handleUpload, className: 'space-y-6' },
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Document Title'),
                      h('input', {
                        type: 'text',
                        required: true,
                        value: newDocTitle,
                        onChange: (e) => setNewDocTitle(e.target.value),
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        placeholder: 'Enter document title'
                      })
                    ),
                    h('div', { className: 'flex gap-4' },
                      h('button', {
                        type: 'button',
                        onClick: () => { setShowUpload(false); setNewDocTitle(''); },
                        className: 'flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition'
                      }, 'Cancel'),
                      h('button', {
                        type: 'submit',
                        disabled: uploading,
                        className: 'flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50'
                      }, uploading ? '⏳ Uploading...' : '📤 Upload')
                    )
                  )
                )
              ),
              showInvoiceUpload && h('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4' },
                h('div', { className: 'bg-white rounded-2xl p-8 max-w-md w-full' },
                  h('h2', { className: 'text-2xl font-bold text-gray-900 mb-6' }, 'Upload Invoice - AI + Manual'),
                  h('div', { className: 'space-y-6' },
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Select Invoice File *'),
                      h('input', {
                        type: 'file',
                        accept: 'image/*,application/pdf',
                        onChange: handleFileSelect,
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        disabled: uploading || isAnalyzing
                      }),
                      selectedFile && h('p', { className: 'mt-2 text-sm text-green-600' },
                        '✓ Selected: ' + selectedFile.name
                      )
                    ),
                    isAnalyzing && h('div', { className: 'flex items-center gap-2 text-blue-600 bg-blue-50 p-4 rounded-lg' },
                      h('div', { className: 'animate-spin text-2xl' }, '🤖'),
                      h('span', {}, 'AI is analyzing invoice...')
                    ),
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Supplier Name *'),
                      h('input', {
                        type: 'text',
                        value: invoiceSupplier,
                        onChange: (e) => setInvoiceSupplier(e.target.value),
                        placeholder: isAnalyzing ? 'AI is filling...' : 'e.g., Google, Amazon, Bezeq',
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        disabled: uploading || isAnalyzing
                      })
                    ),
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Total Amount *'),
                      h('input', {
                        type: 'number',
                        value: invoiceAmount,
                        onChange: (e) => setInvoiceAmount(e.target.value),
                        placeholder: isAnalyzing ? 'AI is filling...' : 'e.g., 1500.00',
                        step: '0.01',
                        min: '0',
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        disabled: uploading || isAnalyzing
                      })
                    ),
                    h('div', { className: 'text-sm text-gray-500' },
                      isAnalyzing 
                        ? '🤖 AI is extracting data from your invoice...' 
                        : 'AI will auto-fill fields when you select a file. Review and adjust if needed.'
                    ),
                    uploading && h('div', { className: 'flex items-center gap-2 text-indigo-600' },
                      h('div', { className: 'animate-spin text-2xl' }, '⚙️'),
                      h('span', {}, 'Uploading invoice...')
                    ),
                    h('div', { className: 'flex gap-4' },
                      h('button', {
                        type: 'button',
                        onClick: handleCancelInvoiceUpload,
                        className: 'flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition',
                        disabled: uploading || isAnalyzing
                      }, 'Cancel'),
                      h('button', {
                        type: 'button',
                        onClick: handleInvoiceUpload,
                        className: 'flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50',
                        disabled: uploading || isAnalyzing || !selectedFile || !invoiceSupplier.trim() || !invoiceAmount || parseFloat(invoiceAmount) <= 0
                      }, uploading ? '⏳ Uploading...' : '📤 Upload')
                    )
                  )
                )
              ),
              showInvoiceModal && selectedInvoice && h('div', { 
                className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4',
                onClick: () => setShowInvoiceModal(false)
              },
                h('div', { 
                  className: 'bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-auto',
                  onClick: (e) => e.stopPropagation()
                },
                  h('div', { className: 'flex justify-between items-start mb-6' },
                    h('div', {},
                      h('h2', { className: 'text-2xl font-bold text-gray-900 mb-2' }, 'Invoice Details'),
                      h('p', { className: 'text-gray-600' }, 'Supplier: ' + selectedInvoice.supplier_name)
                    ),
                    h('button', {
                      onClick: () => setShowInvoiceModal(false),
                      className: 'text-gray-400 hover:text-gray-600 text-2xl'
                    }, '✕')
                  ),
                  h('div', { className: 'grid md:grid-cols-2 gap-6 mb-6' },
                    h('div', {},
                      h('p', { className: 'text-sm text-gray-600 mb-1' }, 'Total Amount'),
                      h('p', { className: 'text-2xl font-bold text-gray-900' }, formatCurrency(selectedInvoice.total_amount))
                    ),
                    h('div', {},
                      h('p', { className: 'text-sm text-gray-600 mb-1' }, 'Date'),
                      h('p', { className: 'text-lg text-gray-900' }, formatDate(selectedInvoice.created_at))
                    ),
                    h('div', {},
                      h('p', { className: 'text-sm text-gray-600 mb-1' }, 'Status'),
                      h('span', { className: 'px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-green-100 text-green-800' }, selectedInvoice.status)
                    )
                  ),
                  // Invoice Preview - PDF or Image
                  h('div', { className: 'bg-gray-100 rounded-lg p-4 mb-6 overflow-hidden' },
                    (() => {
                      const fileUrl = selectedInvoice.file_url;
                      const fileName = fileUrl.split('/').pop() || '';
                      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
                      const isPDF = fileExt === 'pdf' || fileUrl.includes('.pdf');
                      
                      if (isPDF) {
                        // Render PDF in iframe
                        return h('div', { className: 'w-full' },
                          h('p', { className: 'text-sm text-gray-600 mb-2' }, '📄 PDF Preview:'),
                          h('iframe', {
                            src: fileUrl,
                            type: 'application/pdf',
                            className: 'w-full rounded-lg border border-gray-300',
                            style: { height: '600px', minHeight: '600px' }
                          })
                        );
                      } else {
                        // Render image
                        return h('div', { className: 'w-full' },
                          h('p', { className: 'text-sm text-gray-600 mb-2' }, '🖼️ Image Preview:'),
                          h('img', {
                            src: fileUrl,
                            alt: 'Invoice',
                            className: 'w-full h-auto max-h-[600px] object-contain rounded-lg border border-gray-300 bg-white',
                            onError: (e) => {
                              e.target.style.display = 'none';
                              const parent = e.target.parentElement;
                              if (parent) {
                                parent.innerHTML = '<div class="text-center py-20"><p class="text-gray-500">⚠️ Failed to load preview</p><p class="text-sm text-gray-400 mt-2">' + fileName + '</p></div>';
                              }
                            }
                          })
                        );
                      }
                    })()
                  ),
                  h('div', { className: 'flex gap-4' },
                    h('button', {
                      onClick: () => handleDownloadInvoice(selectedInvoice),
                      className: 'flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2'
                    }, '⬇️ Download Invoice'),
                    h('button', {
                      onClick: () => setShowInvoiceModal(false),
                      className: 'px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition'
                    }, 'Close')
                  )
                )
              )
            );
          }
          
          // Main App Component
          function App() {
            const [view, setView] = useState('landing');
            const [user, setUser] = useState(null);
            const [loading, setLoading] = useState(true);
            
            useEffect(() => {
              console.log('[App] Initializing - checking for existing session');
              
              supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session?.user) {
                  console.log('[App] ✓ Existing session found for:', session.user.email);
                  setUser(session.user);
                  setView('dashboard');
                } else {
                  console.log('[App] No existing session');
                }
                setLoading(false);
              });
              
              const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
                console.log('[App] Auth state changed:', event);
                
                if (session?.user) {
                  console.log('[App] ✓ User authenticated:', session.user.email);
                  console.log('[App] Event type:', event);
                  
                  setUser(session.user);
                  setView('dashboard');
                  
                  // Special handling for email verification confirmation
                  if (event === 'SIGNED_IN' && window.location.hash.includes('type=signup')) {
                    console.log('[App] 🎉 Email verification completed - redirecting to dashboard');
                  }
                } else {
                  console.log('[App] User signed out or session ended');
                  setUser(null);
                  setView('landing');
                }
              });
              
              return () => subscription.unsubscribe();
            }, []);
            
            const handleAuth = async (email, password, isSignUp) => {
              if (isSignUp) {
                console.log('[Auth] Starting sign-up for:', email);
                
                const { data, error } = await supabaseClient.auth.signUp({ email, password });
                
                if (error) {
                  console.error('[Auth] Sign-up error:', error);
                  throw error;
                }
                
                console.log('[Auth] Sign-up response received');
                console.log('[Auth] User:', data.user?.id);
                console.log('[Auth] Session:', data.session ? 'present' : 'null');
                
                // Check if email verification is required (session will be null)
                if (data.user && !data.session) {
                  console.log('[Auth] ✉️ Email verification required - session is null');
                  return { requiresVerification: true };
                }
                
                // If session exists, user is authenticated immediately
                if (data.user && data.session) {
                  console.log('[Auth] ✓ User authenticated immediately (no email verification)');
                  setUser(data.user);
                  setView('dashboard');
                  return { requiresVerification: false };
                }
                
                console.warn('[Auth] Unexpected state: no user and no session');
                throw new Error('Sign-up failed: Please try again');
                
              } else {
                console.log('[Auth] Starting sign-in for:', email);
                
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                
                if (error) {
                  console.error('[Auth] Sign-in error:', error);
                  throw error;
                }
                
                if (data.user && data.session) {
                  console.log('[Auth] ✓ Sign-in successful');
                  setUser(data.user);
                  setView('dashboard');
                  return { requiresVerification: false };
                }
                
                console.warn('[Auth] Unexpected state: no user or no session');
                throw new Error('Sign-in failed: Please try again');
              }
            };
            
            const handleSignOut = async () => {
              await supabaseClient.auth.signOut();
              setUser(null);
              setView('landing');
            };
            
            if (loading) {
              return h('div', { className: 'min-h-screen flex items-center justify-center' },
                h('div', { className: 'text-gray-600 text-xl' }, '⏳ Loading...')
              );
            }
            
            if (view === 'landing') {
              return h(Landing, { onGetStarted: () => setView('auth') });
            }
            
            if (view === 'auth') {
              return h(Auth, { onAuth: handleAuth });
            }
            
            // Wrap Dashboard with Organization Context and AppLayout
            return h(OrganizationProvider, { user },
              h(AppLayout, { user, onSignOut: handleSignOut },
                h(Dashboard, { user, onSignOut: handleSignOut })
              )
            );
          }
          
          // Render app with i18n provider
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(h(I18nextProvider, { i18n: i18next }, h(App)));
        </script>
    </body>
    </html>
  `)
})

export default app
