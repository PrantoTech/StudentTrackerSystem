import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;
const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
const MATCH_THRESHOLD = 0.48;
const DETECT_INTERVAL_MS = 900;
const AUTO_CHECKIN_CONFIDENCE = 0.75;
const AUTO_RETRY_COOLDOWN_MS = 8000;

const FACE_IMAGE_KEYS = [
  "face_image_url",
  "face_url",
  "faceImageUrl",
  "face_photo_url",
  "photo_url",
  "profile_image_url",
  "avatar_url",
  "image_url",
  "photo",
  "image",
];

function resolveFaceImageUrl(student) {
  for (const key of FACE_IMAGE_KEYS) {
    const value = student?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function hasFaceProfile(student) {
  return Boolean(resolveFaceImageUrl(student));
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isNotArrivedStatus(value) {
  const normalized = normalizeStatus(value);
  return normalized === "NOT_ARRIVED" || normalized === "NOTARRIVED" || normalized === "";
}

async function createLabeledDescriptors(students) {
  const labels = [];
  const nameById = {};
  let withImage = 0;
  const detectorOptions = [
    new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.25 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }),
  ];

  for (const student of students) {
    const imageUrl = resolveFaceImageUrl(student);
    if (!imageUrl) {
      continue;
    }
    withImage += 1;

    try {
      const image = await faceapi.fetchImage(imageUrl);

      let detection = null;
      for (const detectorOptionsItem of detectorOptions) {
        detection = await faceapi
          .detectSingleFace(image, detectorOptionsItem)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          break;
        }
      }

      if (!detection) {
        continue;
      }

      const label = String(student.id);
      labels.push(new faceapi.LabeledFaceDescriptors(label, [detection.descriptor]));
      nameById[label] = student.name || "Student";
    } catch {
      // Skip malformed/unreachable profile images and keep matching available profiles.
    }
  }

  return { labels, nameById, withImage };
}

function FaceArrivalPanel() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectTimerRef = useRef(null);
  const matcherRef = useRef(null);
  const namesRef = useRef({});
  const busyRef = useRef(false);
  const autoCheckinRef = useRef({ inFlight: false, lastStudentId: "", lastAt: 0 });

  const [cameraError, setCameraError] = useState("");
  const [engineError, setEngineError] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [lastStatus, setLastStatus] = useState("Preparing face recognition...");
  const [match, setMatch] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const showAutoCheckinPopup =
    !loadingProfiles && lastStatus === "Face matched above 75%. Auto check-in in progress...";

  const autoCheckIn = useCallback(async (studentId, fallbackName) => {
    const current = autoCheckinRef.current;
    const now = Date.now();
    if (current.inFlight) {
      return;
    }
    if (current.lastStudentId === studentId && now - current.lastAt < AUTO_RETRY_COOLDOWN_MS) {
      return;
    }

    autoCheckinRef.current = {
      inFlight: true,
      lastStudentId: studentId,
      lastAt: now,
    };
    setSubmitting(true);
    setLastStatus("Checking in automatically...");

    try {
      const response = await fetch(`${API_BASE}/checkin-face/${encodeURIComponent(studentId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.ok && body && body.status === "ARRIVED") {
        setLastStatus(`${body.student_name || fallbackName} checked in successfully.`);
        setMatch(null);
      } else {
        setLastStatus((body && body.message) || "Face check-in failed");
      }
    } catch {
      setLastStatus("Face check-in failed");
    } finally {
      autoCheckinRef.current.inFlight = false;
      setSubmitting(false);
    }
  }, []);

  const clearDetectionLoop = useCallback(() => {
    if (detectTimerRef.current) {
      window.clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    clearDetectionLoop();
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // No-op: pause can fail during teardown in some browsers.
      }
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [clearDetectionLoop]);

  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    const matcher = matcherRef.current;

    if (!video || !matcher || busyRef.current || video.readyState < 2) {
      return;
    }

    busyRef.current = true;
    try {
      const detection = await faceapi
        .detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setMatch(null);
        setLastStatus("No face detected. Look at the camera.");
        return;
      }

      const best = matcher.findBestMatch(detection.descriptor);
      if (best.label !== "unknown" && best.distance <= MATCH_THRESHOLD) {
        const studentId = best.label;
        const studentName = namesRef.current[studentId] || "Student";
        const confidence = Math.max(0, 1 - best.distance);
        setMatch({ studentId, studentName, distance: best.distance, confidence });

        if (confidence >= AUTO_CHECKIN_CONFIDENCE) {
          setLastStatus("Face matched above 75%. Auto check-in in progress...");
          void autoCheckIn(studentId, studentName);
        } else {
          setLastStatus("Face matched. Keep face steady to reach 75% for auto check-in.");
        }
      } else {
        setMatch(null);
        setLastStatus("Face not recognized yet. Please hold still.");
      }
    } catch {
      setMatch(null);
      setLastStatus("Face scan interrupted. Keep camera view steady.");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const startFaceEngine = useCallback(async (isCancelled = () => false) => {
    if (isCancelled()) {
      return;
    }
    setCameraError("");
    setEngineError("");
    setLoadingProfiles(true);
    setLastStatus("Loading face models...");

    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      if (isCancelled()) {
        return;
      }

      setLastStatus("Loading registered student faces...");
      const studentsRes = await fetch(`${API_BASE}/students`);
      const students = studentsRes.ok ? await studentsRes.json() : [];
      const allStudents = Array.isArray(students) ? students : [];
      const notArrivedStudents = allStudents.filter((student) => isNotArrivedStatus(student?.status));

      let profileScope = notArrivedStudents;
      let profileLabel = "students not yet arrived";
      let profileMessage = "Loading registered student faces...";

      if (profileScope.length === 0) {
        profileScope = allStudents.filter((student) => hasFaceProfile(student));
        profileLabel = "students with face profiles";
        profileMessage = "No not-arrived students with faces found. Loading any available verified faces...";
      }

      const { labels, nameById } = await createLabeledDescriptors(profileScope);
      namesRef.current = nameById;
      matcherRef.current = labels.length > 0 ? new faceapi.FaceMatcher(labels, MATCH_THRESHOLD) : null;

      if (labels.length === 0) {
        setLastStatus(
          profileScope.length > 0
            ? `No usable face profiles found for ${profileLabel}. Camera will stay open.`
            : "No face profiles found. Camera will stay open until a face is registered."
        );
      } else {
        setLastStatus(profileMessage);
      }

      if (isCancelled()) {
        return;
      }

      setLastStatus("Starting camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (isCancelled()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (error) {
          if (isCancelled() || error?.name === "AbortError") {
            return;
          }
          throw error;
        }
      }

      if (isCancelled()) {
        return;
      }

      setLastStatus(labels.length > 0 ? "Align face with the camera." : "Face mode is ready. Register a face profile to enable matching.");
      if (labels.length > 0) {
        detectTimerRef.current = window.setInterval(() => {
          void runDetection();
        }, DETECT_INTERVAL_MS);
      }
    } catch (error) {
      if (isCancelled()) {
        return;
      }
      const message = error instanceof Error ? error.message : "Face engine failed to start.";
      if (message.toLowerCase().includes("camera") || message.toLowerCase().includes("permission")) {
        setCameraError("Camera permission denied or camera unavailable.");
      } else {
        setEngineError(message);
      }
    } finally {
      if (!isCancelled()) {
        setLoadingProfiles(false);
      }
    }
  }, [runDetection]);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void startFaceEngine(isCancelled);

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [startFaceEngine, stopCamera]);

  return (
    <section className="face-pickup-screen">
      <div className="panel-intro compact">
        <h2 className="pin-section-title">Face Check-In</h2>
        <p className="subline">
          Use this when parent QR is not available. Look at the camera, then
          tap Check In when matched.
        </p>
      </div>

      {cameraError || engineError ? (
        <div className="notice-card error">
          <p className="camera-error">{cameraError || engineError}</p>
        </div>
      ) : (
        <div className="face-camera-wrap">
          <p
            className={`face-auto-popup ${showAutoCheckinPopup ? "visible" : "hidden"}`}
            role="status"
            aria-live="polite"
            aria-hidden={!showAutoCheckinPopup}
          >
            Face matched above 75%. Auto check-in in progress...
          </p>
          <div className="face-camera-shell">
            <video ref={videoRef} className="face-video" muted playsInline />
          </div>
        </div>
      )}

      <p className="face-status">{loadingProfiles ? "Preparing..." : showAutoCheckinPopup ? "Auto check-in running..." : lastStatus}</p>

      {match ? (
        <p className="face-match-pill" role="status">
          Match: {match.studentName} ({(Math.max(0, match.confidence || (1 - match.distance)) * 100).toFixed(0)}%)
        </p>
      ) : null}

      <p className="face-status">Auto check-in starts at 75% match or above.</p>
    </section>
  );
}

export default FaceArrivalPanel;
