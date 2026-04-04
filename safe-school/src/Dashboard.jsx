import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ParentDashboardView from './components/Dashboard.jsx'
import { apiFetch } from './api.js'
import { useAuth } from './auth/AuthContext.jsx'

const STATUS = {
  NOT_ARRIVED: 'NOT_ARRIVED',
  ARRIVED: 'ARRIVED',
  DEPARTED: 'DEPARTED',
}

function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [student, setStudent] = useState(null)
  const [status, setStatus] = useState(STATUS.NOT_ARRIVED)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkInSuccess, setCheckInSuccess] = useState(false)

  // Gate flow: parent must scan kiosk QR before check-in is authorized.
  const [scanning, setScanning] = useState(false)
  const [verifyingGate, setVerifyingGate] = useState(false)

  const studentIdRef = useRef(null)
  studentIdRef.current = user?.student_id || null

  const hasFetchedRef = useRef(false)

  const [pickupPin, setPickupPin] = useState(null)
  const [pickupPinExpiresAt, setPickupPinExpiresAt] = useState(null)
  const [pinGenerating, setPinGenerating] = useState(false)
  const pinExpiryTimerRef = useRef(null)

  const clearPickupPin = useCallback(() => {
    setPickupPin(null)
    setPickupPinExpiresAt(null)
    if (pinExpiryTimerRef.current) {
      window.clearTimeout(pinExpiryTimerRef.current)
      pinExpiryTimerRef.current = null
    }
  }, [])

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const fetchStudent = useCallback(
    async (silent = false) => {
      const studentId = user?.student_id
      if (!studentId) return

      if (!silent) setLoading(true)
      setError('')

      try {
        const data = await apiFetch(`/students/${studentId}`, {}, { onUnauthorized: handleUnauthorized })

        // Backend is assumed to return student details. We gracefully handle missing fields.
        const nextName = data?.name || data?.student?.name || 'Student'
        const nextStatus = data?.status || STATUS.NOT_ARRIVED
        const nextToken = data?.token || ''
        const arrivedAt = data?.arrived_at ?? data?.student?.arrived_at ?? null
        // Support backend spelling `departured_at`; also accept `departed_at` if ever used.
        const departedAt =
          data?.departured_at ?? data?.departed_at ?? data?.student?.departured_at ?? data?.student?.departed_at ?? null

        setStudent({
          id: studentId,
          name: nextName,
          arrived_at: arrivedAt,
          departured_at: departedAt,
        })
        setStatus(nextStatus)

        if (nextToken) setToken(nextToken)
        else if (nextStatus !== STATUS.ARRIVED) setToken('')
        if (nextStatus !== STATUS.ARRIVED) clearPickupPin()
      } catch (e) {
        if (!silent) {
          const message = e?.message || 'Network error while fetching student.'
          alert(message)
          setError(message)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [user, handleUnauthorized, clearPickupPin],
  )

  const runCheckInAfterGateQr = useCallback(async (sessionToken) => {
    const studentId = studentIdRef.current
    if (!studentId) return
    const cleaned = typeof sessionToken === 'string' ? sessionToken.trim() : ''
    if (!cleaned) {
      const message = 'Invalid gate QR. Missing session token.'
      alert(message)
      setError(message)
      return
    }

    setVerifyingGate(true)
    setError('')
    setCheckInSuccess(false)

    try {
      console.debug('[ParentApp][CheckIn] student_id:', studentId)
      console.debug('[ParentApp][CheckIn] session_token:', cleaned)
      const path = `/checkin/${studentId}/${encodeURIComponent(cleaned)}`
      console.debug('[ParentApp][CheckIn] POST path:', path)

      const data = await apiFetch(
        path,
        { method: 'POST' },
        { onUnauthorized: handleUnauthorized },
      )

      setToken(data?.token ?? '')
      setStatus(data?.status || STATUS.ARRIVED)
      setStudent((prev) =>
        prev
          ? {
              ...prev,
              arrived_at: data?.arrived_at ?? prev.arrived_at ?? null,
              departured_at: data?.departured_at ?? data?.departed_at ?? prev.departured_at ?? null,
            }
          : prev,
      )
      setCheckInSuccess(true)
    } catch (e) {
      const message =
        e?.status === 401
          ? 'Session expired. Please login again.'
          : e?.message || 'Network error during check-in. Is the server running?'
      if (e?.status !== 401) alert(message)
      setError(message)
      throw e
    } finally {
      setVerifyingGate(false)
      setScanning(false)
    }
  }, [handleUnauthorized])

  const generatePickupPin = useCallback(async () => {
    const studentId = user?.student_id
    if (!studentId || status !== STATUS.ARRIVED) return

    setPinGenerating(true)
    setError('')
    try {
      const data = await apiFetch(
        `/generate-pin/${studentId}`,
        { method: 'POST' },
        { onUnauthorized: handleUnauthorized },
      )
      const pin = data?.pin ?? data?.pickup_pin
      const expiresAt = data?.expires_at ?? data?.expiresAt ?? null
      if (pin == null || pin === '') {
        throw new Error('Invalid response: missing PIN.')
      }
      setPickupPin(String(pin))
      setPickupPinExpiresAt(expiresAt)
    } catch (e) {
      const message =
        e?.status === 401
          ? 'Session expired. Please login again.'
          : e?.message || 'Could not generate pickup PIN.'
      if (e?.status !== 401) alert(message)
      setError(message)
    } finally {
      setPinGenerating(false)
    }
  }, [user?.student_id, status, handleUnauthorized])

  const cancelGateScan = useCallback(() => {
    if (verifyingGate) return
    setScanning(false)
  }, [verifyingGate])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // Guard: if an admin somehow reaches /dashboard, route them away.
  useEffect(() => {
    if (!user) return
    if (user.user_type === 'admin') navigate('/admin', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (!user?.student_id) return
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    fetchStudent(false)
  }, [user, fetchStudent])

  // Clear PIN display when backend says it has expired (no polling — single timeout).
  useEffect(() => {
    if (!pickupPinExpiresAt) return
    const t = new Date(pickupPinExpiresAt).getTime()
    if (Number.isNaN(t)) return
    const ms = t - Date.now()
    if (ms <= 0) {
      clearPickupPin()
      return
    }
    pinExpiryTimerRef.current = window.setTimeout(() => {
      clearPickupPin()
    }, ms)
    return () => {
      if (pinExpiryTimerRef.current) {
        window.clearTimeout(pinExpiryTimerRef.current)
        pinExpiryTimerRef.current = null
      }
    }
  }, [pickupPinExpiresAt, clearPickupPin])

  return (
    <main className="app-shell">
      <section className="app-card">
        <h1>Parent Dashboard</h1>

        {loading ? (
          <div className="loading-row" aria-live="polite">
            <span className="spinner" aria-hidden />
            <span>Loading...</span>
          </div>
        ) : null}

        {!user?.student_id ? (
          <p className="error-text" role="alert">
            No student is assigned to this parent account.
          </p>
        ) : student ? (
          <ParentDashboardView
            selectedStudent={student}
            status={status}
            token={token}
            scanning={scanning}
            verifyingGate={verifyingGate}
            loading={loading}
            error={error}
            checkInSuccess={checkInSuccess}
            onOpenGateScan={() => setScanning(true)}
            onCancelGateScan={cancelGateScan}
            onGateCheckIn={runCheckInAfterGateQr}
            onRefreshStatus={() => fetchStudent(false)}
            onLogout={handleLogout}
            pickupPin={pickupPin}
            pinGenerating={pinGenerating}
            onGeneratePickupPin={generatePickupPin}
          />
        ) : (
          <p className="hint">Loading student…</p>
        )}
      </section>
    </main>
  )
}

export default Dashboard

