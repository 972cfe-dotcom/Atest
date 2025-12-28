import { useState, useEffect } from 'react'
import { createSupabaseClient } from './lib/supabase'
import { Landing } from './components/Landing'
import { Auth } from './components/Auth'
import { Dashboard } from './components/Dashboard'

type View = 'landing' | 'auth' | 'dashboard'

export function App() {
  const [view, setView] = useState<View>('landing')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createSupabaseClient())

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setView('dashboard')
      }
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        setView('dashboard')
      } else {
        setUser(null)
        setView('landing')
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleAuth = async (email: string, password: string, isSignUp: boolean) => {
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) throw error
      if (data.user) {
        setUser(data.user)
        setView('dashboard')
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      if (data.user) {
        setUser(data.user)
        setView('dashboard')
      }
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setView('landing')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (view === 'landing') {
    return <Landing onGetStarted={() => setView('auth')} />
  }

  if (view === 'auth') {
    return <Auth onAuth={handleAuth} />
  }

  return <Dashboard user={user} onSignOut={handleSignOut} supabase={supabase} />
}
