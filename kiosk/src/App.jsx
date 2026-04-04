import { useEffect, useMemo, useState } from "react";
import ModeToggle from "./components/ModeToggle";
import ArrivalPanel from "./components/ArrivalPanel";
import DeparturePanel from "./components/DeparturePanel";

const MODE = {
  ARRIVAL: "ARRIVAL",
  DEPARTURE: "DEPARTURE",
};

/** How long success/error full-screen feedback stays before returning to QR / scanner. */
const RESULT_RESET_MS = 2500;

function App() {
  const [mode, setMode] = useState(MODE.ARRIVAL);
  /** Shared result: departure verify (QR or PIN); null when idle. */
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Dropping the other mode's result avoids stale full-screen feedback after toggling.
  useEffect(() => {
    setScanResult((previous) => {
      if (!previous) return null;
      if (mode === MODE.ARRIVAL && previous.flow === "DEPARTURE") return null;
      if (mode === MODE.DEPARTURE && previous.flow === "ARRIVAL") return null;
      return previous;
    });
  }, [mode]);

  // Auto-reset full-screen feedback after departure verify for continuous kiosk use.
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
        <ModeToggle mode={mode} onChange={setMode} />

        <main className="kiosk-stage">
          <section className="stage-card">
            {mode === MODE.ARRIVAL ? (
              <ArrivalPanel />
            ) : (
              <DeparturePanel
                loading={loading}
                setLoading={setLoading}
                scanResult={scanResult}
                setScanResult={setScanResult}
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
