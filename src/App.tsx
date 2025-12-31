import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import { User } from "@supabase/supabase-js"
import Login from "./pages/Login"
import Upload from "./pages/Upload"
import Estimate from "./pages/Estimate"
import History from "./pages/History"
import Navigation from "./components/Navigation"

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {user && <Navigation />}
        <Routes>
          <Route 
            path="/login" 
            element={!user ? <Login /> : <Navigate to="/history" replace />} 
          />
          <Route 
            path="/upload" 
            element={user ? <Upload /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/estimate/:id" 
            element={user ? <Estimate /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/history" 
            element={user ? <History /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/" 
            element={<Navigate to={user ? "/history" : "/login"} replace />} 
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App