import DepartureQR from './DepartureQR'
import QRScanner from './QRScanner'

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
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleTimeString()
  } catch {
    return null
  }
}

/**
 * Parent dashboard: status from backend, gate QR scan to authorize check-in, then departure QR.
 */
function Dashboard({
  selectedStudent,
  status,
  token,
  scanning,
  verifyingGate,
  loading,
  error,
  checkInSuccess,
  onOpenGateScan,
  onCancelGateScan,
  onGateCheckIn,
  onRefreshStatus,
  onLogout,
  pickupPin,
  pinGenerating,
  onGeneratePickupPin,
}) {
  const canScanGate = status === STATUS.NOT_ARRIVED
  const canUsePickupPin = status === STATUS.ARRIVED
  const arrivedAt = selectedStudent?.arrived_at
  const departedAt = selectedStudent?.departured_at
  const arrivalDisplay = formatLocalTime(arrivedAt)
  const departureDisplay = formatLocalTime(departedAt)

  return (
    <div className="dashboard">
      <div className="block">
        <h2 className="student-name">{selectedStudent.name}</h2>
        <p className={`status-badge ${STATUS_COLORS[status] || 'status-red'}`}>{status}</p>
        <p className="hint status-label">Current status</p>

        <div className="timestamp-block">
          {status === STATUS.NOT_ARRIVED ? (
            <p className="timestamp-not-yet">Not yet arrived</p>
          ) : null}

          {status === STATUS.ARRIVED && arrivalDisplay ? (
            <p className="timestamp-row timestamp-arrival">
              <span className="timestamp-label">Arrival Time:</span>{' '}
              <span className="timestamp-value">{arrivalDisplay}</span>
            </p>
          ) : null}

          {status === STATUS.DEPARTED ? (
            <>
              {arrivalDisplay ? (
                <p className="timestamp-row timestamp-arrival">
                  <span className="timestamp-label">Arrival Time:</span>{' '}
                  <span className="timestamp-value">{arrivalDisplay}</span>
                </p>
              ) : null}
              {departureDisplay ? (
                <p className="timestamp-row timestamp-departure">
                  <span className="timestamp-label">Departure Time:</span>{' '}
                  <span className="timestamp-value">{departureDisplay}</span>
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="block actions">
        <button
          type="button"
          className="primary-btn"
          onClick={onOpenGateScan}
          disabled={loading || !canScanGate || scanning || verifyingGate}
        >
          Scan Gate QR to Check-In
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={onRefreshStatus}
          disabled={loading || scanning}
        >
          Refresh Status
        </button>
        <button
          type="button"
          className="tertiary-btn"
          onClick={onLogout}
          disabled={scanning || verifyingGate}
        >
          Logout
        </button>
      </div>

      {scanning ? (
        <QRScanner
          active={scanning}
          isVerifying={verifyingGate}
          onValidated={onGateCheckIn}
          onCancel={onCancelGateScan}
          disabled={!canScanGate}
        />
      ) : null}

      {checkInSuccess ? (
        <p className="success-banner" role="status">
          Checked In Successfully
        </p>
      ) : null}

      {canUsePickupPin ? (
        <div className="block pin-panel">
          <button
            type="button"
            className="secondary-btn pin-generate-btn"
            onClick={onGeneratePickupPin}
            disabled={loading || scanning || verifyingGate || pinGenerating}
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

      <DepartureQR studentId={selectedStudent.id} token={token} />

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  )
}

export default Dashboard
