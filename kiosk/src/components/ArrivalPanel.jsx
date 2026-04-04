import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import FaceArrivalPanel from "./FaceArrivalPanel";

const TOKEN_REFRESH_MS = 45000;
const ARRIVAL_TAB = {
  QR: "QR",
  FACE: "FACE",
};

function createSessionToken() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function ArrivalPanel() {
  const [arrivalTab, setArrivalTab] = useState(ARRIVAL_TAB.QR);
  const [sessionToken, setSessionToken] = useState(() => createSessionToken());

  const generateNewQr = useCallback(() => {
    setSessionToken(createSessionToken());
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSessionToken(createSessionToken());
    }, TOKEN_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const checkInQrPayload = useMemo(
    () =>
      JSON.stringify({
        type: "CHECKIN",
        session_token: sessionToken,
      }),
    [sessionToken]
  );

  return (
    <section className="arrival-screen">
      <div className="panel-intro">
        <h2 className="headline">Student Arrival</h2>
        <p className="subline">
          Use QR for normal check-in. If a parent cannot provide QR, use Face
          Check-In.
        </p>
      </div>

      <div className="departure-tabs" role="tablist" aria-label="Arrival method">
        <button
          type="button"
          role="tab"
          aria-selected={arrivalTab === ARRIVAL_TAB.QR}
          className={`departure-tab ${arrivalTab === ARRIVAL_TAB.QR ? "active" : ""}`}
          onClick={() => setArrivalTab(ARRIVAL_TAB.QR)}
        >
          QR Check-In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={arrivalTab === ARRIVAL_TAB.FACE}
          className={`departure-tab ${arrivalTab === ARRIVAL_TAB.FACE ? "active" : ""}`}
          onClick={() => setArrivalTab(ARRIVAL_TAB.FACE)}
        >
          Face Check-In
        </button>
      </div>

      {arrivalTab === ARRIVAL_TAB.QR ? (
        <div className="arrival-layout">
          <div className="qr-card">
            <div className="card-topline">
              <span className="card-label">Live check-in code</span>
              <span className="card-chip">Refreshes every 45 seconds</span>
            </div>

            <div className="qr-shell" aria-label="Check-in QR code">
              <QRCodeSVG
                value={checkInQrPayload}
                size={320}
                level="H"
                includeMargin
              />
            </div>
          </div>

          <div className="arrival-actions">
            <article className="info-card">
              <h3>How it works</h3>
              <p>
                Keep the kiosk visible near the gate. Parents can scan QR, and
                if QR is unavailable the student can be checked in with face
                scanning.
              </p>
            </article>

            <article className="info-card accent">
              <h3>Need a new code?</h3>
              <p>
                Tap the action below if you want to replace the current arrival
                session immediately.
              </p>

              <button
                type="button"
                className="arrival-submit"
                onClick={generateNewQr}
              >
                Generate New QR
              </button>
            </article>
          </div>
        </div>
      ) : (
        <FaceArrivalPanel />
      )}
    </section>
  );
}

export default ArrivalPanel;
