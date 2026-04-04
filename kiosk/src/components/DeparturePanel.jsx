import { useState } from "react";
import Scanner from "./Scanner";
import PinPickupPanel from "./PinPickupPanel";
import ResultScreen from "./ResultScreen";

const DEPARTURE_TAB = {
  SCAN: "SCAN",
  PIN: "PIN",
};

/**
 * Departure mode: scan parent QR or enter pickup PIN.
 * Result is full-screen feedback; App clears scanResult after a delay.
 */
function DeparturePanel({ loading, setLoading, scanResult, setScanResult }) {
  const [departureTab, setDepartureTab] = useState(DEPARTURE_TAB.SCAN);

  if (scanResult && scanResult.flow === "DEPARTURE") {
    return <ResultScreen result={scanResult} />;
  }

  return (
    <div className="departure-panel">
      <div className="panel-intro">
        <h2 className="headline">Verify Pickup</h2>
        <p className="subline">
          Use QR or a 6-digit pickup PIN to release a student.
        </p>
      </div>

      <div className="departure-tabs" role="tablist" aria-label="Departure method">
        <button
          type="button"
          role="tab"
          aria-selected={departureTab === DEPARTURE_TAB.SCAN}
          className={`departure-tab ${departureTab === DEPARTURE_TAB.SCAN ? "active" : ""}`}
          onClick={() => setDepartureTab(DEPARTURE_TAB.SCAN)}
        >
          Scan QR
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={departureTab === DEPARTURE_TAB.PIN}
          className={`departure-tab ${departureTab === DEPARTURE_TAB.PIN ? "active" : ""}`}
          onClick={() => setDepartureTab(DEPARTURE_TAB.PIN)}
        >
          Enter Pickup PIN
        </button>
      </div>

      {departureTab === DEPARTURE_TAB.SCAN ? (
        <Scanner
          loading={loading}
          setLoading={setLoading}
          onResult={setScanResult}
        />
      ) : (
        <PinPickupPanel
          loading={loading}
          setLoading={setLoading}
          onResult={setScanResult}
        />
      )}
    </div>
  );
}

export default DeparturePanel;
