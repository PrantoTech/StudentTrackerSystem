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
  const pinExpiryTimerRef = useRef(null)

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
          reject(new Error('Could not process selected image.'))
          return
        }

        context.drawImage(image, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.72)
        resolve(compressed)
      } catch {
        reject(new Error('Could not process selected image.'))
      }
    }
    image.onerror = () => reject(new Error('Invalid image file.'))
    image.src = inputDataUrl
  })

  const handleSetFaceProfile = useCallback(() => {
    void (async () => {
      try {
        const imageDataUrl = await pickImageAsDataUrl()
        if (!imageDataUrl) return
        const compressed = await compressDataUrlImage(imageDataUrl)
        if (typeof compressed !== 'string' || !compressed.trim()) {
          alert('Could not process selected image.')
          return
        }
        void updateFaceProfile({ clear: false, imageUrl: compressed })
      } catch (e) {
        alert(e?.message || 'Could not process selected image.')
      }
    })()
  }, [updateFaceProfile])

  const handleClearFaceProfile = useCallback(() => {
    void updateFaceProfile({ clear: true })
  }, [updateFaceProfile])

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
            faceProfileSaving={faceProfileSaving}
            faceProfileRegistered={Boolean(student?.face_url || student?.face_verified)}
            faceProfileVerified={Boolean(student?.face_verified)}
            onSetFaceProfile={handleSetFaceProfile}
            onClearFaceProfile={handleClearFaceProfile}
          />
        ) : (
          <p className="hint">Loading student…</p>
        )}
      </section>
    </main>
  )
}

export default Dashboard

