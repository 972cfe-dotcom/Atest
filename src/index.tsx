import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createServerSupabaseClient } from './lib/supabase'
import type { Document } from './types/database'

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

    // Create Supabase client
    const supabase = createServerSupabaseClient(c.env)

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

    const supabase = createServerSupabaseClient(c.env)
    
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
            const [documents, setDocuments] = useState([]);
            const [loading, setLoading] = useState(true);
            const [showUpload, setShowUpload] = useState(false);
            const [newDocTitle, setNewDocTitle] = useState('');
            const [uploading, setUploading] = useState(false);
            const [processingId, setProcessingId] = useState(null);
            
            useEffect(() => {
              loadDocuments();
            }, []);
            
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
                    h('a', { href: '#', className: 'flex items-center gap-3 px-4 py-3 text-indigo-600 bg-indigo-50 rounded-lg font-medium' }, '📄 Documents')
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
                    h('h1', { className: 'text-2xl font-bold text-gray-900' }, 'My Documents'),
                    h('button', {
                      onClick: () => setShowUpload(true),
                      className: 'flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition'
                    }, '➕ Upload Document')
                  )
                ),
                h('main', { className: 'p-8' },
                  loading ? h('div', { className: 'flex items-center justify-center py-12' }, '⏳ Loading...') :
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
