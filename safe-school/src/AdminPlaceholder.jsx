'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import { Navbar } from './components/navbar'
import { SummaryCards } from './components/summary-cards'
import { SearchFilterBar } from './components/search-filter-bar'
import { StudentTable } from './components/student-table'
import { AlertPanel } from './components/alert-panel'
import './admin.css' // Import the new vanilla CSS

export default function Dashboard() {
  const BASE_URL = `${window.location.protocol}//${window.location.hostname}:3000`
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [students, setStudents] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [forceDepartLoadingId, setForceDepartLoadingId] = useState(null)
  const [resetStudentLoadingId, setResetStudentLoadingId] = useState(null)
  const [faceProfileLoadingId, setFaceProfileLoadingId] = useState(null)
  const [resetSystemLoading, setResetSystemLoading] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)

  const resetTimerRef = useRef(null)

  const fetchStudents = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/students`)
    const data = await res.json()
    setStudents(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    fetchStudents()
    const interval = setInterval(fetchStudents, 2000)
    return () => clearInterval(interval)
  }, [fetchStudents])

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = filterStatus === 'ALL' || student.status === filterStatus
      return matchesSearch && matchesFilter
    })
  }, [students, searchQuery, filterStatus])

  const stats = {
    arrived: students.filter((s) => s.status === 'ARRIVED').length,
    notArrived: students.filter((s) => s.status === 'NOT_ARRIVED').length,
    departed: students.filter((s) => s.status === 'DEPARTED').length,
    pendingPickup: students.filter((s) => s.status === 'ARRIVED').length,
  }

  const handleForceDepart = async (studentId) => {
    if (!studentId) return
    try {
      setForceDepartLoadingId(studentId)
      const res = await fetch(`${BASE_URL}/admin/force-depart/${encodeURIComponent(studentId)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Request failed')
      await fetchStudents()
      alert('Action successful')
    } catch (e) {
      alert(e?.message || 'Action failed')
    } finally {
      setForceDepartLoadingId(null)
    }
  }

  const handleReset = async (studentId) => {
    if (!studentId) return
    try {
      setResetStudentLoadingId(studentId)
      const res = await fetch(`${BASE_URL}/admin/reset-student/${encodeURIComponent(studentId)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Request failed')
      await fetchStudents()
      alert('Action successful')
    } catch (e) {
      alert(e?.message || 'Action failed')
    } finally {
      setResetStudentLoadingId(null)
    }
  }

  const readFaceUrl = (student) => {
    const keys = [
      'face_image_url',
      'face_url',
      'faceImageUrl',
      'face_photo_url',
      'photo_url',
      'profile_image_url',
      'avatar_url',
      'image_url',
      'photo',
      'image',
    ]
    for (const key of keys) {
      const value = student?.[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return ''
  }

  const postFaceProfile = async (studentId, payload) => {
    const routes = [
      `${BASE_URL}/admin/register-face/${encodeURIComponent(studentId)}`,
      `${BASE_URL}/parent/register-face/${encodeURIComponent(studentId)}`,
      `${BASE_URL}/register-face/${encodeURIComponent(studentId)}`,
    ]

    let lastNotFound = null
    for (const route of routes) {
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) return data
      if (res.status === 404) {
        lastNotFound = new Error(data?.error || 'Route not found')
        continue
      }
      throw new Error(data?.error || 'Request failed')
    }

    throw lastNotFound || new Error('Face registration route not found')
  }

  const handleSetFaceProfile = async (student) => {
    if (!student?.id) return

    const pickImageAsDataUrl = () => new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => reject(new Error('Could not read selected image file.'))
        reader.readAsDataURL(file)
      }
      input.click()
    })

    const compressDataUrlImage = (inputDataUrl) => new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        try {
          const maxSide = 720
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
          const width = Math.max(1, Math.round(image.width * scale))
          const height = Math.max(1, Math.round(image.height * scale))

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error('Could not process selected image file.'))
            return
          }

          context.drawImage(image, 0, 0, width, height)
          const compressed = canvas.toDataURL('image/jpeg', 0.72)
          resolve(compressed)
        } catch {
          reject(new Error('Could not process selected image file.'))
        }
      }
      image.onerror = () => reject(new Error('Invalid image file.'))
      image.src = inputDataUrl
    })

    let imageDataUrl = ''
    try {
      const picked = await pickImageAsDataUrl()
      if (!picked) return
      const compressed = await compressDataUrlImage(String(picked))
      imageDataUrl = String(compressed).trim()
      if (!imageDataUrl) {
        alert('Selected image is invalid. Try another photo.')
        return
      }
    } catch (e) {
      alert(e?.message || 'Could not process selected image.')
      return
    }

    try {
      setFaceProfileLoadingId(student.id)
      await postFaceProfile(student.id, { imageDataUrl })
      await fetchStudents()
      alert('Face photo uploaded')
    } catch (e) {
      alert(e?.message || 'Action failed')
    } finally {
      setFaceProfileLoadingId(null)
    }
  }

  const handleClearFaceProfile = async (studentId) => {
    if (!studentId) return
    try {
      setFaceProfileLoadingId(studentId)
      await postFaceProfile(studentId, { clear: true })
      await fetchStudents()
      alert('Face profile removed')
    } catch (e) {
      alert(e?.message || 'Action failed')
    } finally {
      setFaceProfileLoadingId(null)
    }
  }

  const resetDatabase = useCallback(async ({ showAlert = true } = {}) => {
    try {
      setResetSystemLoading(true)
      const res = await fetch(`${BASE_URL}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error('Request failed')
      await fetchStudents()
      if (showAlert) alert('Action successful')
    } catch (e) {
      if (showAlert) alert(e?.message || 'Action failed')
    } finally {
      setResetSystemLoading(false)
    }
  }, [fetchStudents])

  const handleResetSystem = async () => {
    await resetDatabase({ showAlert: true })
  }

  const handleLogout = () => {
    setLogoutLoading(true)
    logout()
    navigate('/login', { replace: true })
  }

  const alerts = useMemo(() => {
    const nowMs = Date.now()
    const twoHoursMs = 2 * 60 * 60 * 1000
    const next = []

    for (const student of students) {
      const name = student?.name || 'Student'

      // A) Students not picked up for long time
      if (student?.status === 'ARRIVED') {
        const arrivedIso = student.arrived_at ?? student.arrivalTime ?? null
        const arrivedMs = arrivedIso ? new Date(arrivedIso).getTime() : NaN
        if (!Number.isNaN(arrivedMs) && nowMs - arrivedMs > twoHoursMs) {
          next.push({
            id: `${student.id}-not-picked-up`,
            type: 'warning',
            title: name,
            message: 'Not picked up for over 2 hours',
          })
        }
      }

      // B) Expired PIN
      const pickupPin = student?.pickup_pin
      const hasPin = pickupPin != null && String(pickupPin).trim() !== ''
      if (hasPin) {
        const pinExpiresIso =
          student.pin_expires_at ?? student.expires_at ?? student.expiresAt ?? student.pinExpiresAt ?? null
        const pinExpiresMs = pinExpiresIso ? new Date(pinExpiresIso).getTime() : NaN
        if (!Number.isNaN(pinExpiresMs) && nowMs > pinExpiresMs) {
          next.push({
            id: `${student.id}-expired-pin`,
            type: 'warning',
            title: name,
            message: 'Pickup PIN has expired',
          })
        }
      }

      // C) Students never arrived
      if (student?.status === 'NOT_ARRIVED') {
        next.push({
          id: `${student.id}-never-arrived`,
          type: 'warning',
          title: name,
          message: 'Student has not arrived yet',
        })
      }
    }

    return next
  }, [students])

  // Auto-reset database at local midnight.
  useEffect(() => {
    let cancelled = false

    const scheduleNext = () => {
      const now = new Date()
      const nextMidnight = new Date(now)
      nextMidnight.setHours(24, 0, 0, 0) // next day 00:00

      const msUntil = nextMidnight.getTime() - now.getTime()
      resetTimerRef.current = window.setTimeout(async () => {
        if (cancelled) return
        await resetDatabase({ showAlert: false })
        scheduleNext()
      }, Math.max(0, msUntil))
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [resetDatabase])

  return (
    <div className="admin-layout">
      <Navbar
        onResetSystem={handleResetSystem}
        resetSystemLoading={resetSystemLoading}
        onLogout={handleLogout}
        logoutLoading={logoutLoading}
      />

      <main className="admin-main">
        {/* Summary Cards */}
        <SummaryCards stats={stats} />

        {/* Search and Filter */}
        <SearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
        />

        {/* Main Content Grid */}
        <div className="admin-content-grid">
          {/* Student Table */}
          <div className="admin-table-section">
            <h2 className="admin-table-header">Students</h2>
            <StudentTable
              students={filteredStudents}
              onForceDepart={handleForceDepart}
              onReset={handleReset}
              onSetFaceProfile={handleSetFaceProfile}
              onClearFaceProfile={handleClearFaceProfile}
              forceDepartLoadingId={forceDepartLoadingId}
              resetStudentLoadingId={resetStudentLoadingId}
              faceProfileLoadingId={faceProfileLoadingId}
            />
            <p className="hint">
              Showing {filteredStudents.length} of {students.length} students
            </p>
          </div>

          {/* Alert Panel */}
          <div className="admin-alert-section">
            <AlertPanel alerts={alerts} />
          </div>
        </div>
      </main>
    </div>
  )
}

