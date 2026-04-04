import { QRCodeSVG } from 'qrcode.react'

/**
 * Renders pickup QR after check-in returns a signed token from the backend.
 */
function DepartureQR({ studentId, token }) {
  if (!studentId || !token) {
    return null
  }

  const departurePayload = JSON.stringify({
    student_id: studentId,
    token,
  })

  return (
    <div className="block qr-panel">
      <h3 className="qr-heading">Departure pickup</h3>
      <div className="qr-frame">
        <QRCodeSVG value={departurePayload} size={280} level="M" includeMargin />
      </div>
      <p className="qr-caption">Show this QR at the gate for pickup</p>
    </div>
  )
}

export default DepartureQR
