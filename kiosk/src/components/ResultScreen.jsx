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
 * Full-screen kiosk feedback for arrival check-in or departure verification.
 * flow: ARRIVAL → check-in copy; DEPARTURE → verified / invalid pickup copy.
 */
function ResultScreen({ result }) {
  useEffect(() => {
    playTone(result.type);
  }, [result.type]);

  const isArrival = result.flow === "ARRIVAL";
  const isSuccess = result.type === "success";
  const isDeparturePin = result.flow === "DEPARTURE" && result.viaPin;

  return (
    <section className={`result-screen ${result.type}`}>
      {isSuccess ? (
        isArrival ? (
          <>
            <h1 className="result-title">✅ Student Checked In</h1>
            <p className="result-message">{result.studentName}</p>
          </>
        ) : isDeparturePin ? (
          <>
            <h1 className="result-title">Verified</h1>
            <p className="result-message">Student departed</p>
            {result.studentName ? (
              <p className="result-subline">{result.studentName}</p>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="result-title">✅ VERIFIED</h1>
            <p className="result-message">
              {result.studentName} has departed
            </p>
          </>
        )
      ) : (
        <>
          {isDeparturePin ? (
            <h1 className="result-title">
              {result.message || "Invalid PIN"}
            </h1>
          ) : (
            <>
              <h1 className="result-title">❌ INVALID</h1>
              <p className="result-message">
                {result.message || "QR invalid or already used"}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default ResultScreen;
