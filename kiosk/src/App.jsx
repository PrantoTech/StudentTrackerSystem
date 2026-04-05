import { useEffect, useMemo, useState } from "react";
import RfidScannerPanel from "./components/RfidScannerPanel";
import ResultScreen from "./components/ResultScreen";

/** How long full-screen feedback stays before returning to the tap screen. */
const RESULT_RESET_MS = 2500;

function App() {
  /** Shared result feedback for scan outcomes; null when idle. */
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Auto-reset full-screen feedback for continuous kiosk use.
  useEffect(() => {
    if (!scanResult) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setScanResult(null);
    }, RESULT_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [scanResult]);

  const resultTone = useMemo(() => {
    if (!scanResult) {
      return null;
    }
    return scanResult.type === "success" ? "success" : "error";
  }, [scanResult]);

  return (
    <div className={`app-root ${resultTone ? `tone-${resultTone}` : ""}`}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <div className="app-shell">
        <main className="kiosk-stage">
          <section className="stage-card">
            {scanResult ? (
              <ResultScreen result={scanResult} />
            ) : (
              <RfidScannerPanel
                loading={loading}
                setLoading={setLoading}
                onResult={setScanResult}
              />
            )}
          </section>
        </main>

        <footer className="kiosk-footer">
          Copyright 2026 Rakshyn. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

export default App;
