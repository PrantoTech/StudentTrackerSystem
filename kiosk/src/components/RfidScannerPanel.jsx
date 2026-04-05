import { useCallback, useState } from "react";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

function parseCombinedScan(rawValue) {
  const value = String(rawValue || "").trim();
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const studentId = value.slice(0, separatorIndex).trim();
  const cardId = value.slice(separatorIndex + 1).trim();
  if (!studentId || !cardId) {
    return null;
  }

  return { studentId, cardId };
}

function RfidScannerPanel({ loading, setLoading, onResult }) {
  const [combinedScan, setCombinedScan] = useState("");
  const [lastSubmitted, setLastSubmitted] = useState("");
  const [pendingApproval, setPendingApproval] = useState(null);
  const [parentIdInput, setParentIdInput] = useState("");
  const [parentIdError, setParentIdError] = useState("");
  const [verifyingParentId, setVerifyingParentId] = useState(false);

  const submitScan = useCallback(
    async (rawValue) => {
      const parsed = parseCombinedScan(rawValue);
      if (!parsed || loading) {
        if (!loading) {
          onResult({
            flow: "ARRIVAL",
            type: "error",
            message: "Invalid scan",
          });
        }
        return;
      }

      const dedupeKey = `${parsed.studentId}::${parsed.cardId}`;
      if (dedupeKey === lastSubmitted) return;

      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/rfid/scan/${encodeURIComponent(rawValue.trim())}`, {
          method: "POST",
        });

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        if (response.ok && body?.status) {
          if (body.status === "PENDING_PARENT_APPROVAL") {
            setPendingApproval({
              requestId: body?.request_id || "",
              studentId: body?.student_id || parsed.studentId,
              studentName: body?.student_name || "Student",
              message: body?.message || "Parent ID verification required.",
              dedupeKey,
            });
            setParentIdInput("");
            setParentIdError("");
            setCombinedScan("");
            return;
          }

          const flow =
            body.status === "ARRIVED"
              ? "ARRIVAL"
              : body.status === "PENDING_PARENT_APPROVAL"
                ? "PENDING_APPROVAL"
                : "DEPARTURE";
          onResult({
            flow,
            type: "success",
            studentName: body?.student_name || "Student",
            message: body?.message || "Scan processed",
          });
          setLastSubmitted(dedupeKey);
          setCombinedScan("");
        } else {
          onResult({
            flow: "ARRIVAL",
            type: "error",
            message: body?.message || "Could not process RFID scan",
          });
        }
      } catch {
        onResult({
          flow: "ARRIVAL",
          type: "error",
          message: "Network error while sending scan",
        });
      } finally {
        setLoading(false);
      }
    },
    [lastSubmitted, loading, onResult, setLoading]
  );

  const submitParentIdApproval = useCallback(async () => {
    if (!pendingApproval?.studentId || !pendingApproval?.requestId) {
      setParentIdError("Missing departure request details. Please scan again.");
      return;
    }

    const normalizedParentId = String(parentIdInput || "").trim();
    if (!normalizedParentId) {
      setParentIdError("Parent ID is required.");
      return;
    }

    setVerifyingParentId(true);
    setParentIdError("");

    try {
      const response = await fetch(`${API_BASE}/parent/verify-departure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: pendingApproval.studentId,
          request_id: pendingApproval.requestId,
          approved: true,
          parent_id: normalizedParentId,
        }),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        setParentIdError(body?.error || body?.message || "Could not verify Parent ID.");
        return;
      }

      onResult({
        flow: "DEPARTURE",
        type: "success",
        studentName: pendingApproval.studentName,
        message: "Parent ID verified. Student departed.",
      });
      setLastSubmitted(pendingApproval.dedupeKey || "");
      setPendingApproval(null);
      setParentIdInput("");
      setParentIdError("");
    } catch {
      setParentIdError("Network error while verifying Parent ID.");
    } finally {
      setVerifyingParentId(false);
    }
  }, [pendingApproval, parentIdInput, onResult]);

  const cancelParentIdPopup = useCallback(() => {
    if (verifyingParentId) return;
    setPendingApproval(null);
    setParentIdInput("");
    setParentIdError("");
  }, [verifyingParentId]);

  const scanValueIsValid = Boolean(parseCombinedScan(combinedScan));

  return (
    <section className="scanner-screen">
      <div className="panel-intro">
        <h2 className="headline">RFID Scanner</h2>
      </div>

      <div className="scanner-content-grid">
        <div className="scanner-shell single-flow">
          <div className="scanner-view scanner-placeholder" aria-label="Scanner camera view placeholder">
            <div className="scanner-placeholder-content">
              <p>Scanner Camera View</p>
              <span>RFID reader input is captured on the right</span>
            </div>
          </div>
        </div>

        <div className="arrival-actions scanner-form">
          <label className="arrival-label" htmlFor="rfid-combined-text">
            Student + Card ID
          </label>
          <input
            id="rfid-combined-text"
            className="arrival-select"
            type="text"
            placeholder="Enter scan value"
            value={combinedScan}
            onChange={(event) => setCombinedScan(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitScan(combinedScan);
              }
            }}
            autoFocus
          />

          <button
            type="button"
            className="arrival-submit"
            disabled={loading || !scanValueIsValid}
            onClick={() => void submitScan(combinedScan)}
          >
            {loading ? "Scanning..." : "Send Scan"}
          </button>
        </div>
      </div>

      {pendingApproval ? (
        <div className="parent-id-popup-overlay" role="dialog" aria-modal="true" aria-label="Parent ID verification">
          <div className="parent-id-popup-card">
            <p className="section-pill success">Departure Verification</p>
            <h3 className="parent-id-popup-title">Enter Parent ID</h3>
            <p className="parent-id-popup-message">
              {pendingApproval.message || "Parent ID is required to complete departure."}
            </p>
            <p className="parent-id-popup-student">Student: {pendingApproval.studentName}</p>

            <label className="arrival-label" htmlFor="parent-id-input">
              Parent ID
            </label>
            <input
              id="parent-id-input"
              className="arrival-select"
              type="text"
              placeholder="Enter parent ID"
              value={parentIdInput}
              onChange={(event) => setParentIdInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitParentIdApproval();
                }
              }}
              autoFocus
            />

            {parentIdError ? <p className="parent-id-popup-error">{parentIdError}</p> : null}

            <div className="parent-id-popup-actions">
              <button
                type="button"
                className="arrival-submit"
                disabled={verifyingParentId}
                onClick={() => void submitParentIdApproval()}
              >
                {verifyingParentId ? "Verifying..." : "Verify & Depart"}
              </button>
              <button
                type="button"
                className="departure-tab"
                disabled={verifyingParentId}
                onClick={cancelParentIdPopup}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default RfidScannerPanel;
