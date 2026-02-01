import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from './lib/supabase'
import { extractInvoiceData } from './lib/invoiceExtraction'
import type { Document, Invoice } from './types/database'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
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
app.get('/api/invoices', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // No env needed - hardcoded credentials
    const supabase = createServerSupabaseClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const { data: invoices, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('[Get Invoices] Error:', fetchError)
      return c.json({ error: 'Failed to fetch invoices', details: fetchError.message }, 500)
    }

    return c.json({ invoices })
  } catch (error: any) {
    console.error('[Get Invoices] Critical error:', error)
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
    const supabaseServiceKey = 'sb_secret_ZpY2INapqj8cym1xdRjYGA_CJiBL0Eh'
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
  // Hardcoded Supabase credentials for Cloudflare deployment
  const supabaseUrl = 'https://dmnxblcdaqnenggfyurw.supabase.co'
  const supabaseAnonKey = 'sb_publishable_B5zKNJ_dI1254sPk4Yt0hQ_p-3qdaRe'

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SaaS Document Processor</title>
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
        
        <!-- Inline React Application -->
        <script type="module">
          const { useState, useEffect, createElement: h } = React;
          const { createClient } = supabase;
          
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
            
            const handleSubmit = async (e) => {
              e.preventDefault();
              setError('');
              setLoading(true);
              try {
                await onAuth(email, password, isSignUp);
              } catch (err) {
                setError(err.message || 'Authentication failed');
              } finally {
                setLoading(false);
              }
            };
            
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
          
          // Dashboard Component
          function Dashboard({ user, onSignOut }) {
            const [activeTab, setActiveTab] = useState('documents');
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
            
            useEffect(() => {
              if (activeTab === 'documents') {
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
            
            const handleFileSelect = (e) => {
              console.log('[Invoice Upload] File selected:', e.target.files[0]?.name);
              if (e.target.files && e.target.files[0]) {
                setSelectedFile(e.target.files[0]);
                console.log('[Invoice Upload] File stored in state:', e.target.files[0].name);
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
            
            return h('div', { className: 'min-h-screen bg-gray-50' },
              h('aside', { className: 'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200' },
                h('div', { className: 'h-full flex flex-col' },
                  h('div', { className: 'p-6 border-b border-gray-200' },
                    h('h2', { className: 'text-xl font-bold text-gray-900' }, 'DocProcessor')
                  ),
                  h('nav', { className: 'flex-1 p-4 space-y-2' },
                    h('button', { 
                      onClick: () => setActiveTab('documents'),
                      className: activeTab === 'documents' 
                        ? 'w-full flex items-center gap-3 px-4 py-3 text-indigo-600 bg-indigo-50 rounded-lg font-medium' 
                        : 'w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg font-medium'
                    }, '📄 Documents'),
                    h('button', { 
                      onClick: () => setActiveTab('invoices'),
                      className: activeTab === 'invoices' 
                        ? 'w-full flex items-center gap-3 px-4 py-3 text-indigo-600 bg-indigo-50 rounded-lg font-medium' 
                        : 'w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg font-medium'
                    }, '🧾 Invoices')
                  ),
                  h('div', { className: 'p-4 border-t border-gray-200' },
                    h('div', { className: 'flex items-center gap-3 px-4 py-3 text-sm text-gray-600 mb-2' },
                      h('div', { className: 'w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center' },
                        h('span', { className: 'text-indigo-600 font-medium' }, user?.email?.[0]?.toUpperCase())
                      ),
                      h('div', { className: 'flex-1 min-w-0' },
                        h('p', { className: 'font-medium text-gray-900 truncate' }, user?.email)
                      )
                    ),
                    h('button', {
                      onClick: onSignOut,
                      className: 'w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition'
                    }, '🚪 Sign Out')
                  )
                )
              ),
              h('div', { className: 'pl-64' },
                h('header', { className: 'bg-white border-b border-gray-200 sticky top-0 z-40' },
                  h('div', { className: 'px-8 py-4 flex items-center justify-between' },
                    h('h1', { className: 'text-2xl font-bold text-gray-900' }, 
                      activeTab === 'documents' ? 'My Documents' : 'My Invoices'
                    ),
                    activeTab === 'documents' ? h('button', {
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
                  activeTab === 'documents' ? (
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
                  h('h2', { className: 'text-2xl font-bold text-gray-900 mb-6' }, 'Upload Invoice - Manual Entry'),
                  h('div', { className: 'space-y-6' },
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Select Invoice File *'),
                      h('input', {
                        type: 'file',
                        accept: 'image/*,application/pdf',
                        onChange: handleFileSelect,
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        disabled: uploading
                      }),
                      selectedFile && h('p', { className: 'mt-2 text-sm text-green-600' },
                        '✓ Selected: ' + selectedFile.name
                      )
                    ),
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Supplier Name *'),
                      h('input', {
                        type: 'text',
                        value: invoiceSupplier,
                        onChange: (e) => setInvoiceSupplier(e.target.value),
                        placeholder: 'e.g., Google, Amazon, Bezeq',
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        disabled: uploading
                      })
                    ),
                    h('div', {},
                      h('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Total Amount *'),
                      h('input', {
                        type: 'number',
                        value: invoiceAmount,
                        onChange: (e) => setInvoiceAmount(e.target.value),
                        placeholder: 'e.g., 1500.00',
                        step: '0.01',
                        min: '0',
                        className: 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition',
                        disabled: uploading
                      })
                    ),
                    h('div', { className: 'text-sm text-gray-500' },
                      'All fields are required. Enter supplier name and amount manually.'
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
                        disabled: uploading
                      }, 'Cancel'),
                      h('button', {
                        type: 'button',
                        onClick: handleInvoiceUpload,
                        className: 'flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50',
                        disabled: uploading || !selectedFile || !invoiceSupplier.trim() || !invoiceAmount || parseFloat(invoiceAmount) <= 0
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
                  h('div', { className: 'bg-gray-100 rounded-lg p-8 mb-6 min-h-[400px] flex items-center justify-center' },
                    h('div', { className: 'text-center' },
                      h('div', { className: 'text-6xl mb-4' }, '🧾'),
                      h('p', { className: 'text-gray-600' }, 'Invoice preview'),
                      h('p', { className: 'text-sm text-gray-500 mt-2' }, 'File: ' + selectedInvoice.file_url.split('/').pop())
                    )
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
              supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session?.user) {
                  setUser(session.user);
                  setView('dashboard');
                }
                setLoading(false);
              });
              
              const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, session) => {
                if (session?.user) {
                  setUser(session.user);
                  setView('dashboard');
                } else {
                  setUser(null);
                  setView('landing');
                }
              });
              
              return () => subscription.unsubscribe();
            }, []);
            
            const handleAuth = async (email, password, isSignUp) => {
              if (isSignUp) {
                const { data, error } = await supabaseClient.auth.signUp({ email, password });
                if (error) throw error;
                if (data.user) {
                  setUser(data.user);
                  setView('dashboard');
                }
              } else {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
                if (data.user) {
                  setUser(data.user);
                  setView('dashboard');
                }
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
            
            return h(Dashboard, { user, onSignOut: handleSignOut });
          }
          
          // Render app
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(h(App));
        </script>
    </body>
    </html>
  `)
})

export default app
