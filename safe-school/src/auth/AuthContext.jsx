import { createContext, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'safe_school_user'

const AuthContext = createContext(null)

function safeParse(json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? safeParse(raw) : null
      return parsed?.id ? parsed : null
    } catch {
      return null
    }
  })
  const [bootstrapping] = useState(false)

  const login = (nextUser) => {
    setUser(nextUser)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
  }

  const logout = () => {
    setUser(null)
    window.localStorage.removeItem(STORAGE_KEY)
  }

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      bootstrapping,
      isAuthenticated: Boolean(user),
    }),
    [user, bootstrapping],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

