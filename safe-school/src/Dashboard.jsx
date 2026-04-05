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
  const [faceProfileSaving, setFaceProfileSaving] = useState(false)
  const [pendingDepartureRequest, setPendingDepartureRequest] = useState(null)
  const [departureRequestBusy, setDepartureRequestBusy] = useState(false)
  const loggedInParentId = user?.user_type === 'parent' ? user?.id || '' : ''
  const pinExpiryTimerRef = useRef(null)
  const dashboardLabel = user?.user_type === 'student' ? 'Student Dashboard' : 'Parent Dashboard'
  const noStudentMessage = user?.user_type === 'student'
    ? 'This student account does not have an assigned profile.'
    : 'No student is assigned to this parent account.'

  const resolveFaceUrl = (studentLike) => {
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
      const value = studentLike?.[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return ''
  }

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
        const faceUrl = resolveFaceUrl(data) || resolveFaceUrl(data?.student)
        const faceVerified = Boolean(
          data?.face_verified ||
          data?.faceVerified ||
          data?.is_face_verified ||
          data?.isFaceVerified ||
          data?.face_verified_at ||
          data?.faceVerifiedAt ||
          data?.face_profile_verified_at ||
          data?.faceProfileVerifiedAt ||
          data?.student?.face_verified ||
          data?.student?.faceVerified ||
          data?.student?.is_face_verified ||
          data?.student?.isFaceVerified ||
          data?.student?.face_verified_at ||
          data?.student?.faceVerifiedAt ||
          data?.student?.face_profile_verified_at ||
          data?.student?.faceProfileVerifiedAt
        )

        setStudent({
          id: studentId,
          name: nextName,
          parent_id: data?.parent_id ?? data?.student?.parent_id ?? null,
          parent_name: data?.parent_name ?? data?.student?.parent_name ?? null,
          arrived_at: arrivedAt,
          departured_at: departedAt,
          face_url: faceUrl,
          face_verified: faceVerified,
          face_verified_at:
            data?.face_verified_at ||
            data?.faceVerifiedAt ||
            data?.face_profile_verified_at ||
            data?.faceProfileVerifiedAt ||
            data?.student?.face_verified_at ||
            data?.student?.faceVerifiedAt ||
            data?.student?.face_profile_verified_at ||
            data?.student?.faceProfileVerifiedAt ||
            null,
        })
        setStatus(nextStatus)

        if (nextToken) setToken(nextToken)
        else if (nextStatus !== STATUS.ARRIVED) setToken('')
        if (nextStatus !== STATUS.ARRIVED) clearPickupPin()
      } catch (e) {
        if (e?.status === 404) {
          const message = 'Student profile not found. Please login again.'
          alert(message)
          setError(message)
          logout()
          navigate('/login', { replace: true })
          return
        }

        if (!silent) {
          const message = e?.message || 'Network error while fetching student.'
          alert(message)
          setError(message)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [user, handleUnauthorized, clearPickupPin, logout, navigate],
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

  const fetchPendingDepartureRequest = useCallback(async () => {
    const studentId = user?.student_id
    if (!studentId) {
      setPendingDepartureRequest(null)
      return
    }

    try {
      const data = await apiFetch(
        `/parent/departure-request/${encodeURIComponent(studentId)}`,
        {},
        { onUnauthorized: handleUnauthorized },
      )
      if (data?.status === 'PENDING_PARENT_APPROVAL' && data?.request_id) {
        setPendingDepartureRequest(data)
      } else {
        setPendingDepartureRequest(null)
      }
    } catch (e) {
      if (e?.status !== 404) {
        console.error('Failed to fetch pending departure request', e)
      }
      setPendingDepartureRequest(null)
    }
  }, [user?.student_id, handleUnauthorized])

  const resolveDepartureRequest = useCallback(async (approved, parentId = '') => {
    const studentId = user?.student_id
    const requestId = pendingDepartureRequest?.request_id
    const requiresParentId = Boolean(pendingDepartureRequest?.requires_parent_id)
    if (!studentId || !requestId) return

    if (approved && requiresParentId && !String(parentId || '').trim()) {
      alert('Parent ID is required for departure approval.')
      return
    }

    setDepartureRequestBusy(true)
    setError('')
    try {
      await apiFetch(
        '/parent/verify-departure',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: studentId,
            request_id: requestId,
            approved,
            parent_id: approved ? String(parentId || '').trim() : '',
          }),
        },
        { onUnauthorized: handleUnauthorized },
      )

      setPendingDepartureRequest(null)
      await fetchStudent(true)
    } catch (e) {
      const message =
        e?.status === 401
          ? 'Session expired. Please login again.'
          : e?.message || 'Could not verify departure request.'
      if (e?.status !== 401) alert(message)
      setError(message)
    } finally {
      setDepartureRequestBusy(false)
    }
  }, [
    user?.student_id,
    pendingDepartureRequest?.request_id,
    pendingDepartureRequest?.requires_parent_id,
    handleUnauthorized,
    fetchStudent,
  ])

  const updateFaceProfile = useCallback(async ({ clear = false, imageUrl = '' } = {}) => {
    const studentId = user?.student_id
    if (!studentId) return

    if (!clear && !String(imageUrl || '').trim()) {
      alert('Face image is required.')
      return
    }

    setFaceProfileSaving(true)
    setError('')
    try {
      const payload = clear ? { clear: true } : { imageDataUrl: String(imageUrl).trim() }
      const routes = [
        '/admin/register-face/' + encodeURIComponent(studentId),
        '/parent/register-face/' + encodeURIComponent(studentId),
        '/register-face/' + encodeURIComponent(studentId),
      ]

      let lastError = null
      for (const route of routes) {
        try {
          await apiFetch(route, {
            method: 'POST',
            body: JSON.stringify(payload),
          }, { onUnauthorized: handleUnauthorized })
          lastError = null
          break
        } catch (routeError) {
          if (routeError?.status !== 404) {
            throw routeError
          }
          lastError = routeError
        }
      }

      if (lastError) {
        throw lastError
      }

      await fetchStudent(true)
      alert(clear ? 'Face profile removed' : 'Face profile saved')
    } catch (e) {
      const message =
        e?.status === 401
          ? 'Session expired. Please login again.'
          : e?.message || 'Could not update face profile.'
      if (e?.status !== 401) alert(message)
      setError(message)
    } finally {
      setFaceProfileSaving(false)
    }
  }, [user?.student_id, fetchStudent, handleUnauthorized])

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

  useEffect(() => {
    if (!user?.student_id) return undefined
    if (status !== STATUS.ARRIVED) {
      setPendingDepartureRequest(null)
      return undefined
    }

    fetchPendingDepartureRequest()
    const interval = window.setInterval(fetchPendingDepartureRequest, 4000)
    return () => window.clearInterval(interval)
  }, [user?.student_id, status, fetchPendingDepartureRequest])

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
        <h1>{dashboardLabel}</h1>

        {loading ? (
          <div className="loading-row" aria-live="polite">
            <span className="spinner" aria-hidden />
            <span>Loading...</span>
          </div>
        ) : null}

        {!user?.student_id ? (
          <p className="error-text" role="alert">
            {noStudentMessage}
          </p>
        ) : student ? (
          <ParentDashboardView
            selectedStudent={student}
            accountType={user?.user_type}
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
            faceProfileVerified={Boolean(student?.face_verified)}
            pendingDepartureRequest={pendingDepartureRequest}
            departureRequestBusy={departureRequestBusy}
            loggedInParentId={loggedInParentId}
            onApproveDepartureRequest={(parentId) => resolveDepartureRequest(true, parentId)}
            onRejectDepartureRequest={() => resolveDepartureRequest(false)}
          />
        ) : error ? (
          <p className="error-text" role="alert">{error}</p>
        ) : (
          <p className="hint">Student data is not available right now. Please refresh or login again.</p>
        )}
      </section>
    </main>
  )
}

export default Dashboard

