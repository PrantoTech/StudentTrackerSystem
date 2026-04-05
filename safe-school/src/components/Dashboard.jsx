import { useState } from 'react'

const STATUS = {
  NOT_ARRIVED: 'NOT_ARRIVED',
  ARRIVED: 'ARRIVED',
  DEPARTED: 'DEPARTED',
}

const STATUS_COLORS = {
  NOT_ARRIVED: 'status-red',
  ARRIVED: 'status-orange',
  DEPARTED: 'status-green',
}

function formatLocalTime(iso) {
  if (iso == null || iso === '') return null

  const raw = String(iso).trim()
  if (!raw) return null

  const candidates = [
    raw,
    // Some browsers fail on "YYYY-MM-DD HH:mm:ss"; convert to ISO-like form.
    raw.includes(' ') ? raw.replace(' ', 'T') : raw,
  ]

  for (const candidate of candidates) {
    try {
      const d = new Date(candidate)
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    } catch {
      // Continue trying fallbacks.
    }
  }

  // Final fallback: extract clock part if present, so UI still shows time text.
  const match = raw.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)
  return match ? match[0] : null
}

/**
 * Dashboard view: status, refresh controls, departure requests, and pickup PIN.
 */
function Dashboard({
  selectedStudent,
  accountType,
  loggedInParentId,
  status,
  loading,
  error,
  onRefreshStatus,
  onLogout,
  pickupPin,
  pinGenerating,
  onGeneratePickupPin,
  faceProfileVerified,
  pendingDepartureRequest,
  departureRequestBusy,
  onApproveDepartureRequest,
  onRejectDepartureRequest,
}) {
  const isStudentAccount = accountType === 'student'
  const [parentIdValue, setParentIdValue] = useState(() => String(loggedInParentId || ''))
  const canUsePickupPin = status === STATUS.ARRIVED
  const arrivedAt = selectedStudent?.arrived_at
  const departedAt = selectedStudent?.departured_at
  const arrivalDisplay = formatLocalTime(arrivedAt)
  const departureDisplay = formatLocalTime(departedAt)
  const studentInitial = (selectedStudent?.name || 'S').trim().charAt(0).toUpperCase()
  const showTracker = status !== STATUS.NOT_ARRIVED
  const arrivalDone = status === STATUS.ARRIVED || status === STATUS.DEPARTED
  const departureDone = status === STATUS.DEPARTED
  const requiresParentIdForDeparture = Boolean(pendingDepartureRequest?.requires_parent_id)

  let trackNote = ''
  if (status === STATUS.ARRIVED) trackNote = 'Student arrived at gate'
  if (status === STATUS.DEPARTED) trackNote = 'Student departed successfully'

  return (
    <div className="dashboard">
      <div className="dashboard-hero block">
        <div className="student-avatar" aria-hidden>
          {studentInitial}
        </div>

        <div className="dashboard-hero-copy">
          <p className="dashboard-kicker">Assigned student</p>
          <h2 className="student-name">{selectedStudent.name}</h2>
          <p className="hint status-label">
            Student ID: {selectedStudent.id} | Parent ID: {selectedStudent.parent_id || loggedInParentId || '-'}
          </p>
          <p className="hint status-label">Current status</p>
          <p className={`status-badge ${STATUS_COLORS[status] || 'status-red'}`}>{status}</p>
        </div>
      </div>

      {showTracker ? (
        <div className="order-track-card block">
          <div className="order-track-head">
            <p className="track-title">Student Tracking</p>
            <p className="track-note">{trackNote}</p>
          </div>

          <div className="order-track">
            <article className={`track-step ${arrivalDone ? 'done' : 'active'}`}>
              <span className="track-dot" aria-hidden />
              <div className="track-body">
                <p className="track-time-inline">
                  Arrival{arrivalDisplay ? `, ${arrivalDisplay}` : ''}
                </p>
              </div>
            </article>

            <span className={`track-line ${departureDone ? 'done' : ''}`} aria-hidden />

            <article className={`track-step ${departureDone ? 'done' : 'pending'}`}>
              <span className="track-dot" aria-hidden />
              <div className="track-body">
                <p className="track-time-inline">
                  Departure{departureDisplay ? `, ${departureDisplay}` : ''}
                </p>
              </div>
            </article>
          </div>
        </div>
      ) : null}

      <div className="block actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={onRefreshStatus}
          disabled={loading}
        >
          Refresh Status
        </button>
        <button
          type="button"
          className="tertiary-btn"
          onClick={onLogout}
          disabled={loading}
        >
          Logout
        </button>
        {!isStudentAccount ? (
          <p className="actions-note">
            Face Profile: {faceProfileVerified ? 'Verified' : 'Missing'} | Use refresh if gate status does not update immediately.
          </p>
        ) : null}
      </div>

      {pendingDepartureRequest ? (
        <div className="block pin-panel">
          <p className="pin-display-label">Departure request notification</p>
          <p className="pin-warning">
            Kiosk requested departure verification for {pendingDepartureRequest.student_name || selectedStudent.name}.
          </p>
          {!isStudentAccount && requiresParentIdForDeparture ? (
            <label className="field" style={{ marginTop: '0.75rem' }}>
              <span className="field-label">Parent ID verification</span>
              <input
                className="input"
                type="text"
                value={parentIdValue}
                onChange={(event) => setParentIdValue(event.target.value)}
                placeholder="Enter parent ID"
              />
            </label>
          ) : null}
          <div className="departure-request-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={departureRequestBusy || (requiresParentIdForDeparture && !String(parentIdValue || '').trim())}
              onClick={() => onApproveDepartureRequest(parentIdValue)}
            >
              {departureRequestBusy ? 'Processing…' : 'Approve Departure'}
            </button>
            <button
              type="button"
              className="tertiary-btn"
              disabled={departureRequestBusy}
              onClick={onRejectDepartureRequest}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {canUsePickupPin && !isStudentAccount ? (
        <div className="block pin-panel">
          <button
            type="button"
            className="secondary-btn pin-generate-btn"
            onClick={onGeneratePickupPin}
            disabled={loading || pinGenerating}
          >
            {pinGenerating ? 'Generating…' : 'Generate Pickup PIN'}
          </button>
          <p className="pin-warning">Share this PIN only with trusted person</p>
          {pickupPin ? (
            <>
              <p className="pin-display-label">Your Pickup PIN:</p>
              <p className="pin-display-value" aria-live="polite">
                {pickupPin}
              </p>
              <p className="pin-validity">Valid for 10 minutes</p>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  )
}

export default Dashboard
