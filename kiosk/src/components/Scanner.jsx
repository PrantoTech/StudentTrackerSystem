import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ID = "departure-qr-scanner";
const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

function verifyDepartureUrl(studentId, token) {
  const sid = encodeURIComponent(String(studentId));
  const tok = encodeURIComponent(String(token));
  return `${API_BASE}/verify-departure/${sid}/${tok}`;
}

/**
 * Departure scanner: one decode → one verify request.
 *
 * html5-qrcode may fire the success callback multiple times for the same frame
 * before the camera stops. React state (e.g. scanEnabled) updates async, so a
 * second callback can slip through and call the API again — often the second
 * response is ERROR (token already used), which overwrites SUCCESS in the UI.
 * We gate with processingRef synchronously so only the first callback runs.
 *
 * Avoid stopping the camera in two places at once (scan handler + effect
 * cleanup triggered by the same state change): that races video.play() teardown
 * and surfaces as AbortError: play() interrupted because media was removed.
 */
function Scanner({ loading, setLoading, onResult }) {
  const scannerRef = useRef(null);
  const warningTimerRef = useRef(null);
  /**
   * True after first decode is accepted until this Scanner instance unmounts.
   * Prevents duplicate verify calls if the library delivers extra callbacks after stop().
   */
  const processingRef = useRef(false);
  /** Always points at latest handler so the camera effect does not restart on every render. */
  const handleScanRef = useRef(null);
  const [cameraError, setCameraError] = useState("");
  const [scanWarning, setScanWarning] = useState(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch {
      // Ignore cleanup errors to keep kiosk flow resilient.
    } finally {
      scannerRef.current = null;
    }
  }, []);

  const parseQrPayload = (decodedText) => {
    try {
      const parsed = JSON.parse(decodedText);
      if (!parsed?.student_id || !parsed?.token) {
        throw new Error("Missing required fields.");
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const handleScan = useCallback(
    async (decodedText) => {
      if (processingRef.current) {
        return;
      }
      processingRef.current = true;
      setScanWarning(false);
      if (warningTimerRef.current) {
        window.clearTimeout(warningTimerRef.current);
      }
      setLoading(true);

      try {
        await stopScanner();

        const payload = parseQrPayload(decodedText);
        if (!payload) {
          onResult({
            flow: "DEPARTURE",
            type: "error",
            message: "QR invalid or already used",
          });
          return;
        }

        const response = await fetch(
          verifyDepartureUrl(payload.student_id, payload.token),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        let result = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }

        if (response.ok && result && result.status === "DEPARTED") {
          onResult({
            flow: "DEPARTURE",
            type: "success",
            studentName: result.student_name || "Student",
            message: result.message,
          });
        } else {
          onResult({
            flow: "DEPARTURE",
            type: "error",
            message:
              (result && result.message) || "QR invalid or already used",
          });
        }
      } catch {
        onResult({
          flow: "DEPARTURE",
          type: "error",
          message: "QR invalid or already used",
        });
      } finally {
        setLoading(false);
      }
    },
    [onResult, setLoading, stopScanner]
  );

  handleScanRef.current = handleScan;

  useEffect(() => {
    processingRef.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startScanner = async () => {
      setCameraError("");

      // Clear stale markup from any previous Scanner instance (StrictMode/fast toggles)
      const root = document.getElementById(SCANNER_ID);
      if (root) {
        root.innerHTML = "";
      }

      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 300, height: 300 },
            aspectRatio: 1,
          },
          (decodedText) => {
            const run = handleScanRef.current;
            if (run) {
              void run(decodedText);
            }
          },
          () => {
            if (processingRef.current) {
              return;
            }
            setScanWarning(true);
            if (warningTimerRef.current) {
              window.clearTimeout(warningTimerRef.current);
            }
            warningTimerRef.current = window.setTimeout(() => {
              setScanWarning(false);
            }, 700);
          }
        );
      } catch {
        if (!cancelled) {
          setCameraError("Camera permission denied or camera unavailable.");
          setLoading(false);
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (warningTimerRef.current) {
        window.clearTimeout(warningTimerRef.current);
      }
      stopScanner();
    };
  }, [setLoading, stopScanner]);

  return (
    <section className="scanner-screen">
      <p className="subline scanner-top-note">
        Align the QR code inside the frame to verify pickup.
      </p>

      {cameraError ? (
        <div className="notice-card error">
          <p className="camera-error">{cameraError}</p>
        </div>
      ) : (
        <div className={`scanner-shell ${scanWarning ? "scan-warning" : ""}`}>
          <div id={SCANNER_ID} className="scanner-view" />
          <div className="scanner-warning-glow" aria-hidden="true" />
        </div>
      )}

      {loading ? <p className="scanner-loading">Verifying...</p> : null}
    </section>
  );
}

export default Scanner;
