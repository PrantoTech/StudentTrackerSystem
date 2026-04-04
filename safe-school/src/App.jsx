import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import AdminPlaceholder from './AdminPlaceholder.jsx'

function HomeRedirect() {
  const { user, bootstrapping } = useAuth()

  if (bootstrapping) {
    return (
      <main className="app-shell">
        <section className="app-card">
          <div className="loading-row" aria-live="polite">
            <span className="spinner" aria-hidden />
            <span>Loading...</span>
          </div>
        </section>
      </main>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.user_type === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/dashboard" replace />
}

function ProtectedRoute({ allow, children }) {
  const { user, bootstrapping } = useAuth()

  if (bootstrapping) return null
  if (!user) return <Navigate to="/login" replace />
  if (allow && !allow.includes(user.user_type)) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allow={['parent']}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allow={['admin']}>
            <AdminPlaceholder />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
