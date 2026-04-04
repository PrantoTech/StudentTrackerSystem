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
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotPassword, setForgotPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')

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

  const onForgotSubmit = async (event) => {
    event.preventDefault()
    setForgotError('')
    setForgotMessage('')

    const normalizedEmail = forgotEmail.trim().toLowerCase()
    if (!normalizedEmail) {
      setForgotError('Email is required.')
      return
    }

    if (forgotPassword.length < 6) {
      setForgotError('Password must be at least 6 characters.')
      return
    }

    if (forgotPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match.')
      return
    }

    setForgotLoading(true)
    try {
      await apiFetch('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          newPassword: forgotPassword,
        }),
      })

      setForgotMessage('Password updated. You can now login with your new password.')
      setEmail(normalizedEmail)
      setPassword('')
      setForgotPassword('')
      setForgotConfirmPassword('')
    } catch (e) {
      if (e?.status === 404) {
        setForgotError('Email not found.')
      } else if (e?.status === 400) {
        setForgotError(e?.message || 'Invalid reset details.')
      } else {
        setForgotError('Could not reset password. Please try again.')
      }
    } finally {
      setForgotLoading(false)
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

          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setForgotOpen((prev) => !prev)
              setForgotError('')
              setForgotMessage('')
              if (!forgotOpen) {
                setForgotEmail(email)
              }
            }}
          >
            {forgotOpen ? 'Hide forgot password' : 'Forgot password?'}
          </button>
        </form>

        {forgotOpen ? (
          <form className="form forgot-form" onSubmit={onForgotSubmit}>
            <h2 className="forgot-title">Reset Password</h2>

            <label className="field">
              <span className="field-label">Account Email</span>
              <input
                className="input"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="user@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">New Password</span>
              <input
                className="input"
                type="password"
                value={forgotPassword}
                onChange={(e) => setForgotPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Confirm New Password</span>
              <input
                className="input"
                type="password"
                value={forgotConfirmPassword}
                onChange={(e) => setForgotConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                required
              />
            </label>

            <button className="secondary-btn" type="submit" disabled={forgotLoading}>
              {forgotLoading ? 'Updating…' : 'Update Password'}
            </button>

            {forgotError ? (
              <p className="error-text" role="alert">
                {forgotError}
              </p>
            ) : null}

            {forgotMessage ? <p className="success-banner">{forgotMessage}</p> : null}
          </form>
        ) : null}

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

