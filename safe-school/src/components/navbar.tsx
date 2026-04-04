'use client'

import { useState, useEffect } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'

interface NavbarProps {
  onResetSystem: () => void
  resetSystemLoading: boolean
  onLogout: () => void
  logoutLoading: boolean
}

export function Navbar({ onResetSystem, resetSystemLoading, onLogout, logoutLoading }: NavbarProps) {
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      }))
    }
    
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <nav className="admin-navbar">
      <h1>Admin Dashboard</h1>
      <div className="admin-nav-actions">
        <div className="admin-time">{currentTime}</div>
        <button
          className="admin-btn-reset"
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={onResetSystem}
          disabled={resetSystemLoading}
        >
          <RefreshCw size={14} />
          {resetSystemLoading ? 'Resetting…' : 'Reset System'}
        </button>
        <button
          className="admin-btn-logout"
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={onLogout}
          disabled={resetSystemLoading || logoutLoading}
        >
          <LogOut size={14} />
          {logoutLoading ? 'Logging out…' : 'Logout'}
        </button>
      </div>
    </nav>
  )
}

