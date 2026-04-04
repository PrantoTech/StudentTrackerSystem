import { useCallback, useState } from "react";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

const PIN_LENGTH = 6;

/**
 * Manual 6-digit PIN verification for pickup. Student is resolved on the server from the PIN.
 */
function PinPickupPanel({ loading, setLoading, onResult }) {
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState("");

  const pinValid = pin.length === PIN_LENGTH && /^\d{6}$/.test(pin);

  const handlePinChange = useCallback((event) => {
    const raw = event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(raw);
    setLocalError("");
  }, []);

  const handleVerify = async () => {
    if (!pinValid) {
      setLocalError("Enter a 6-digit PIN.");
      return;
    }

    setLocalError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/verify-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.ok && body && body.status === "DEPARTED") {
        const name = body.student_name || "Student";
        onResult({
          flow: "DEPARTURE",
          type: "success",
          viaPin: true,
          studentName: name,
          message: body.message || "Student departed",
        });
        setPin("");
      } else {
        const msg =
          (body && body.message) ||
          (response.status === 410 ? "Expired PIN" : "Invalid PIN");
        onResult({
          flow: "DEPARTURE",
          type: "error",
          viaPin: true,
          message: msg,
        });
      }
    } catch {
      onResult({
        flow: "DEPARTURE",
        type: "error",
        viaPin: true,
        message: "Invalid PIN",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="pin-pickup-screen">
      <div className="panel-intro compact">
        <h2 className="pin-section-title">Enter Pickup PIN</h2>
        <p className="subline">Enter the 6-digit code to verify pickup.</p>
      </div>

      <div className="pin-form">
        <label className="arrival-label" htmlFor="pickup-pin">
          6-digit PIN
        </label>
        <input
          id="pickup-pin"
          className="pin-input"
          type="text"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="one-time-code"
          maxLength={PIN_LENGTH}
          placeholder="••••••"
          value={pin}
          onChange={handlePinChange}
          aria-invalid={pin.length > 0 && !pinValid}
        />

        {(localError || (pin.length > 0 && !pinValid)) && (
          <p className="pin-hint error" role="alert">
            {localError ||
              (pin.length > 0 && !pinValid
                ? "PIN must be exactly 6 digits."
                : "")}
          </p>
        )}

        <button
          type="button"
          className="arrival-submit"
          disabled={loading || !pinValid}
          onClick={handleVerify}
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
      </div>
    </section>
  );
}

export default PinPickupPanel;
