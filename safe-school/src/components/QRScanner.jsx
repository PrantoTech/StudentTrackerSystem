import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Html5Qrcode } from 'html5-qrcode'

const SCANNER_ELEMENT_ID = 'gate-checkin-scanner-view'

const INVALID_QR_MESSAGE = 'Invalid QR. Please scan the official gate QR'
const MISSING_TOKEN_MESSAGE = 'Invalid QR. Missing session token.'

/**
 * Short beep + vibration when a valid gate QR is read (two-way verification step 1).
 */
function feedbackOnValidScan() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(80)
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.12)
    osc.onended = () => ctx.close()
  } catch {
    // Ignore if audio autopolicy blocks playback.
  }
}

function parseGatePayload(decodedText) {
  const trimmed = decodedText?.trim()
  if (!trimmed) return { ok: false }
  try {
    const data = JSON.parse(trimmed)
    if (data && data.type === 'CHECKIN' && typeof data.session_token === 'string' && data.session_token.trim()) {
      return { ok: true, data }
    }
  } catch {
    /* not JSON */
  }
  return { ok: false }
}

/**
 * Full-screen gate scanner:
 * - Validates kiosk payload JSON: { "type": "CHECKIN", "session_token": "..." }
 * - Calls onValidated(sessionToken) to perform the secure backend check-in.
 */
function QRScanner({ active, isVerifying, onValidated, onCancel, disabled }) {
  const scannerRef = useRef(null)
  const handledRef = useRef(false)
  const [cameraError, setCameraError] = useState('')
  const onValidatedRef = useRef(onValidated)
  const disabledRef = useRef(disabled)
  const isVerifyingRef = useRef(isVerifying)

  useLayoutEffect(() => {
    onValidatedRef.current = onValidated
    disabledRef.current = disabled
    isVerifyingRef.current = isVerifying
  }, [onValidated, disabled, isVerifying])

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current
    scannerRef.current = null
    if (!instance) return
    try {
      await instance.stop()
    } catch {
      // Already stopped or not running.
    }
    try {
      await instance.clear()
    } catch {
      // ignore
    }
  }, [])

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return

    setCameraError('')

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = scanner

    const config = { fps: 10, qrbox: { width: 260, height: 260 } }

    const onDecoded = async (decodedText) => {
      if (handledRef.current || disabledRef.current || isVerifyingRef.current) return

      console.debug('[ParentApp][QR] raw decodedText:', decodedText)
      const parsed = parseGatePayload(decodedText)
      if (!parsed.ok) {
        // Differentiate non-JSON/type failures vs missing token so kiosk setup issues are clearer.
        try {
          const maybeJson = JSON.parse(decodedText?.trim() || '')
          if (maybeJson && maybeJson.type === 'CHECKIN' && !maybeJson.session_token) {
            alert(MISSING_TOKEN_MESSAGE)
          } else {
            alert(INVALID_QR_MESSAGE)
          }
        } catch {
          alert(INVALID_QR_MESSAGE)
        }
        return
      }

      console.debug('[ParentApp][QR] parsed payload:', parsed.data)
      console.debug('[ParentApp][QR] extracted session_token:', parsed.data.session_token)
      handledRef.current = true
      feedbackOnValidScan()

      try {
        await stopScanner()
        await onValidatedRef.current(parsed.data.session_token)
      } catch {
        handledRef.current = false
      }
    }

    const tryStart = async (constraints) => {
      await scanner.start(constraints, config, onDecoded, () => {})
    }

    try {
      await tryStart({ facingMode: 'environment' })
    } catch {
      try {
        await tryStart({ facingMode: 'user' })
      } catch (fallbackError) {
        await stopScanner()
        const name = fallbackError?.name || ''
        const msg = String(fallbackError?.message || '')
        const denied = name === 'NotAllowedError' || /denied|permission/i.test(msg)
        setCameraError(
          denied
            ? 'Camera access denied. Allow camera permission to scan the gate QR.'
            : 'Unable to start camera. Check permissions and try again.',
        )
      }
    }
  }, [stopScanner])

  useEffect(() => {
    if (active) {
      handledRef.current = false
    }
  }, [active])

  useEffect(() => {
    if (!active || isVerifying || disabled) {
      return
    }

    const schedule = window.setTimeout(() => {
      startScanner()
    }, 0)

    return () => {
      window.clearTimeout(schedule)
      stopScanner()
    }
  }, [active, isVerifying, disabled, startScanner, stopScanner])

  const handleCancel = () => {
    if (isVerifying) return
    stopScanner()
    onCancel()
  }

  if (!active) {
    return null
  }

  return createPortal(
    <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Gate QR scanner">
      <div className="scanner-overlay-backdrop" />

      <div className="scanner-sheet">
        <p className="scanner-hint">Point camera at gate QR</p>

        {isVerifying ? (
          <div className="scanner-verifying" aria-live="polite">
            <span className="spinner scanner-verifying-spinner" aria-hidden />
            <span>Verifying check-in…</span>
          </div>
        ) : (
          <>
            <div id={SCANNER_ELEMENT_ID} className="scanner-view" />
            {cameraError ? <p className="scanner-camera-error">{cameraError}</p> : null}
          </>
        )}

        <button
          type="button"
          className="scanner-cancel-btn"
          onClick={handleCancel}
          disabled={isVerifying}
        >
          Cancel Scan
        </button>
      </div>
    </div>,
    document.body,
  )
}

export default QRScanner
