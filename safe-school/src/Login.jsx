import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from './api.js'
import { useAuth } from './auth/AuthContext.jsx'

function Login() {
  const navigate = useNavigate()
  const { user, login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // If user is already logged in, route them to their role home.
  useEffect(() => {
    if (!user) return
    navigate(user.user_type === 'admin' ? '/admin' : '/dashboard', { replace: true })
  }, [user, navigate])

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await apiFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      const nextUser = data?.user
      if (!nextUser?.id || !nextUser?.user_type) {
        throw new Error('Invalid login response.')
      }

      login(nextUser)
      navigate(nextUser.user_type === 'admin' ? '/admin' : '/dashboard', { replace: true })
    } catch (e) {
      const message =
        e?.status === 401
          ? 'Invalid email or password.'
          : e?.message || 'Network error during login.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card">
        <h1>Parent Student Tracker</h1>
        <p className="hint">Sign in to view your assigned student.</p>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}

export default Login

