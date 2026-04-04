function ModeToggle({ mode, onChange }) {
  return (
    <header className="mode-toggle">
      <button
        type="button"
        className={`mode-btn ${mode === "ARRIVAL" ? "active" : ""}`}
        onClick={() => onChange("ARRIVAL")}
      >
        Arrival Mode
      </button>
      <button
        type="button"
        className={`mode-btn ${mode === "DEPARTURE" ? "active" : ""}`}
        onClick={() => onChange("DEPARTURE")}
      >
        Departure Mode
      </button>
    </header>
  );
}

export default ModeToggle;
