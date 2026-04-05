import { useEffect } from "react";

function playTone(type) {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = type === "success" ? 880 : 240;
    gain.gain.value = 0.08;

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + (type === "success" ? 0.12 : 0.25));
  } catch {
    // Audio can fail on some kiosk browsers; app flow continues.
  }
}

/**
 * Full-screen kiosk feedback for RFID arrival/departure verification.
 */
function ResultScreen({ result }) {
  useEffect(() => {
    playTone(result.type);
  }, [result.type]);

  const isArrival = result.flow === "ARRIVAL";
  const isPendingApproval = result.flow === "PENDING_APPROVAL";
  const isSuccess = result.type === "success";

  return (
    <section className={`result-screen ${result.type}`}>
      <div className="result-card">
        <div className="result-mark" aria-hidden="true">
          {isSuccess ? "✓" : "!"}
        </div>

        {isSuccess ? (
          isArrival ? (
            <>
              <p className="section-pill success">Scan successful</p>
              <h1 className="result-title">Student Arrived</h1>
              <p className="result-message">{result.studentName}</p>
              {result.message ? <p className="result-subline">{result.message}</p> : null}
            </>
          ) : isPendingApproval ? (
            <>
              <p className="section-pill success">Scan successful</p>
              <h1 className="result-title">Parent Approval Required</h1>
              <p className="result-message">{result.studentName}</p>
              {result.message ? <p className="result-subline">{result.message}</p> : null}
            </>
          ) : (
            <>
              <p className="section-pill success">Scan successful</p>
              <h1 className="result-title">Student Departed</h1>
              <p className="result-message">{result.studentName}</p>
              {result.message ? <p className="result-subline">{result.message}</p> : null}
            </>
          )
        ) : (
          <>
            <p className="section-pill error">Tap failed</p>
            <h1 className="result-title">Could Not Process Card</h1>
            <p className="result-message">{result.message || "Please try again"}</p>
          </>
        )}
      </div>
    </section>
  );
}

export default ResultScreen;
