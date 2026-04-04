import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const TOKEN_REFRESH_MS = 45000;

function createSessionToken() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function ArrivalPanel() {
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
      <h1 className="headline">SCAN TO CHECK-IN</h1>
      <p className="subline">Parents scan this QR when student arrives</p>

      <div className="qr-shell" aria-label="Check-in QR code">
        <QRCodeSVG value={checkInQrPayload} size={360} level="H" includeMargin />
      </div>

      <div className="arrival-actions">
        <button
          type="button"
          className="arrival-submit"
          onClick={generateNewQr}
        >
          Generate New QR
        </button>
      </div>
    </section>
  );
}

export default ArrivalPanel;
