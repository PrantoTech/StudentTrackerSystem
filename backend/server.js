const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { getLocalIP } = require("./utils/network");

const app = express();
const PORT = 3000;
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://yurrdolffqsvkzwihhgo.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_Y5_5drrwfyxjFsWn9laEkw_5cYwbI2J";

/*
-----------------------------------
MIDDLEWARE
-----------------------------------
*/

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Uploaded image is too large. Please use a smaller photo." });
  }
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  return next(err);
});

// Configuration endpoint for dynamic base URL
app.get("/config", (req, res) => {
  const ip = getLocalIP() || "localhost";
  res.json({
    baseUrl: `http://${ip}:${PORT}`,
    supabaseUrl: SUPABASE_URL,
  });
});

// Debug middleware
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.url}`, req.body || "");
  next();
});

/*
-----------------------------------
SUPABASE CONFIG
-----------------------------------
*/

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const FACE_IMAGE_FIELDS = [
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

const FACE_VERIFIED_FIELDS = [
  "face_verified",
  "faceVerified",
  "is_face_verified",
  "isFaceVerified",
];

const FACE_VERIFIED_AT_FIELDS = [
  "face_verified_at",
  "faceVerifiedAt",
  "face_profile_verified_at",
  "faceProfileVerifiedAt",
  "verified_at",
  "verifiedAt",
];

const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
const FACE_PROFILE_STORE_PATH = path.join(__dirname, "face-profiles.json");

function estimateDataUrlImageBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return 0;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return 0;
  const b64 = dataUrl.slice(commaIndex + 1).replace(/\s/g, "");
  if (!b64) return 0;
  const padding = (b64.match(/=+$/) || [""])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function readFaceProfileStore() {
  try {
    if (!fs.existsSync(FACE_PROFILE_STORE_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(FACE_PROFILE_STORE_PATH, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFaceProfileStore(store) {
  fs.writeFileSync(FACE_PROFILE_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function saveFaceProfileToStore(studentId, valueOrNull) {
  const store = readFaceProfileStore();
  const key = String(studentId);
  if (valueOrNull == null || valueOrNull === "") {
    delete store[key];
  } else {
    store[key] = valueOrNull;
  }
  writeFaceProfileStore(store);
}

function getStoredFaceProfile(studentId) {
  const store = readFaceProfileStore();
  const entry = store[String(studentId)];
  if (!entry) return null;
  if (typeof entry === "string") {
    return {
      face_url: entry,
      face_verified: true,
      face_verified_at: null,
    };
  }
  if (typeof entry === "object") {
    const faceUrl = typeof entry.face_url === "string" ? entry.face_url.trim() : "";
    if (!faceUrl) return null;
    return {
      face_url: faceUrl,
      face_verified: Boolean(entry.face_verified),
      face_verified_at: typeof entry.face_verified_at === "string" ? entry.face_verified_at : null,
    };
  }
  return null;
}

function readFaceVerificationState(student) {
  const verified = FACE_VERIFIED_FIELDS.some((field) => Boolean(student?.[field]));
  const verifiedAt =
    FACE_VERIFIED_AT_FIELDS.find((field) => typeof student?.[field] === "string" && student[field].trim()) ||
    null;
  return {
    face_verified: verified,
    face_verified_at: verifiedAt ? student[verifiedAt].trim() : null,
  };
}

function buildFaceProfileUpdatePayload(student, faceValue, clear = false) {
  const payload = {};

  for (const field of FACE_IMAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(student, field)) {
      payload[field] = clear ? null : faceValue;
    }
  }

  for (const field of FACE_VERIFIED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(student, field)) {
      payload[field] = clear ? false : true;
    }
  }

  for (const field of FACE_VERIFIED_AT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(student, field)) {
      payload[field] = clear ? null : new Date().toISOString();
    }
  }

  return payload;
}

function mergeFaceProfile(student) {
  if (!student || typeof student !== "object") return student;
  const hasFace = FACE_IMAGE_FIELDS.some((field) => {
    const value = student[field];
    return typeof value === "string" && value.trim() !== "";
  });
  if (hasFace) {
    return {
      ...student,
      ...readFaceVerificationState(student),
    };
  }

  const fallbackFace = getStoredFaceProfile(student.id);
  if (!fallbackFace) return student;
  return {
    ...student,
    ...fallbackFace,
  };
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isArrivedStatus(value) {
  return normalizeStatus(value) === "ARRIVED";
}

function isDepartedStatus(value) {
  return normalizeStatus(value) === "DEPARTED";
}

function isNotArrivedStatus(value) {
  const normalized = normalizeStatus(value);
  return normalized === "NOT_ARRIVED" || normalized === "NOTARRIVED" || normalized === "";
}

/*
-----------------------------------
LOGIN API
-----------------------------------
*/
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        student_id: user.student_id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login error" });
  }
});

/*
-----------------------------------
FORGOT PASSWORD API
-----------------------------------
*/
app.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || "").trim();

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const { data: user, error: findError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!user) {
      return res.status(404).json({ error: "Email not found" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ password: newPassword })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Could not reset password" });
  }
});

/*
-----------------------------------
CHECK-IN (QR BASED)
-----------------------------------
*/
app.post("/checkin/:id/:session_token", async (req, res) => {
  try {
    const { id, session_token } = req.params;

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (!student) return res.status(404).json({ error: "Student not found" });

    if (isArrivedStatus(student.status)) {
      return res.json({ status: "ARRIVED", token: student.token });
    }

    const { error } = await supabase
      .from("students")
      .update({
        status: "ARRIVED",
        token: session_token,
        arrived_at: new Date().toISOString(),
        departed_at: null,
        verification_type: "QR",
      })
      .eq("id", id);

    if (error) throw error;

    res.json({ status: "ARRIVED", token: session_token });
  } catch (err) {
    console.error("Check-in error:", err);
    res.status(500).json({ error: "Check-in failed" });
  }
});

/*
-----------------------------------
VERIFY DEPARTURE (QR)
-----------------------------------
*/
app.post("/verify-departure/:id/:token", async (req, res) => {
  try {
    const { id, token } = req.params;

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (!student) return res.status(404).json({ message: "Student not found" });

    if (student.token !== token) {
      return res.json({ status: "ERROR", message: "Invalid token" });
    }

    const { error } = await supabase
      .from("students")
      .update({
        status: "DEPARTED",
        token: null,
        pickup_pin: null,
        pin_expires_at: null,
        departed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    res.json({ status: "DEPARTED", student_name: student.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});

/*
-----------------------------------
GENERATE PIN
-----------------------------------
*/
app.post("/generate-pin/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (!student || student.status !== "ARRIVED") {
      return res.status(400).json({ error: "Student not eligible" });
    }

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from("students")
      .update({
        pickup_pin: pin,
        pin_expires_at: expires,
      })
      .eq("id", id);

    if (error) throw error;

    res.json({ pin, expires_at: expires });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PIN generation failed" });
  }
});

/*
-----------------------------------
VERIFY PIN (PRIMARY)
-----------------------------------
*/
app.post("/verify-pin", async (req, res) => {
  try {
    const pin = String(req.body.pin);

    const { data: students } = await supabase
      .from("students")
      .select("*")
      .eq("pickup_pin", pin)
      .eq("status", "ARRIVED");

    if (!students || students.length !== 1) {
      return res.json({ status: "ERROR", message: "Invalid PIN" });
    }

    const student = students[0];

    if (new Date() > new Date(student.pin_expires_at)) {
      return res.json({ status: "ERROR", message: "Expired PIN" });
    }

    const { error } = await supabase
      .from("students")
      .update({
        status: "DEPARTED",
        pickup_pin: null,
        pin_expires_at: null,
        departed_at: new Date().toISOString(),
        verification_type: "PIN",
      })
      .eq("id", student.id);

    if (error) throw error;

    res.json({ status: "DEPARTED", student_name: student.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PIN verification failed" });
  }
});

/*
-----------------------------------
CHECK-IN BY FACE (ALTERNATIVE TO QR)
-----------------------------------
*/
app.post("/checkin-face/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (!student) {
      return res.status(404).json({ status: "ERROR", message: "Student not found" });
    }

    if (!isNotArrivedStatus(student.status)) {
      return res
        .status(400)
        .json({ status: "ERROR", message: "Student is already checked in or departed" });
    }

    const { error } = await supabase
      .from("students")
      .update({
        status: "ARRIVED",
        token: null,
        pickup_pin: null,
        pin_expires_at: null,
        arrived_at: new Date().toISOString(),
        departed_at: null,
        verification_type: "FACE",
      })
      .eq("id", id);

    if (error) throw error;

    res.json({
      status: "ARRIVED",
      student_name: student.name,
      message: "Face recognized. Student checked in.",
    });
  } catch (err) {
    console.error("Face check-in error:", err);
    res.status(500).json({ status: "ERROR", message: "Face check-in failed" });
  }
});

/*
-----------------------------------
ADMIN APIs
-----------------------------------
*/

async function registerFaceProfileHandler(req, res) {
  try {
    const student_id = req.params.id;
    const clear = req.body?.clear === true;
    const rawUrl = String(
      req.body?.imageUrl || req.body?.faceImageUrl || req.body?.image_url || ""
    ).trim();
    const imageDataUrl = String(req.body?.imageDataUrl || "").trim();
    const payloadValue = imageDataUrl || rawUrl;

    if (!clear) {
      if (!payloadValue) {
        return res.status(400).json({ error: "Face image is required" });
      }

      const isDataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(payloadValue);
      if (!isDataUrl) {
        try {
          new URL(payloadValue);
        } catch {
          return res.status(400).json({ error: "Face image must be a valid URL or uploaded image" });
        }
      } else {
        const imageBytes = estimateDataUrlImageBytes(payloadValue);
        if (imageBytes > MAX_UPLOAD_IMAGE_BYTES) {
          return res.status(400).json({ error: "Uploaded image must be 10MB or smaller" });
        }
      }
    }

    const { data: student, error: fetchError } = await supabase
      .from("students")
      .select("*")
      .eq("id", student_id)
      .single();

    if (fetchError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const faceField = FACE_IMAGE_FIELDS.find((field) =>
      Object.prototype.hasOwnProperty.call(student, field)
    );
    const updatePayload = buildFaceProfileUpdatePayload(student, payloadValue, clear);
    let source = "local_store";

    if (faceField) {
      const { error: updateError } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("id", student_id);

      if (!updateError) {
        source = "students_table";
      } else {
        // Prototype fallback: keep registration usable even without a writable face column.
        saveFaceProfileToStore(
          student_id,
          clear ? null : {
            face_url: payloadValue,
            face_verified: true,
            face_verified_at: new Date().toISOString(),
          }
        );
      }
    } else {
      // Prototype fallback: if no face column exists, store profile locally.
      saveFaceProfileToStore(
        student_id,
        clear ? null : {
          face_url: payloadValue,
          face_verified: true,
          face_verified_at: new Date().toISOString(),
        }
      );
    }

    res.json({
      message: clear ? "Face profile removed" : "Face profile saved",
      face_field: faceField || "face_image_url",
      face_url: clear ? null : payloadValue,
      face_verified: !clear,
      face_verified_at: clear ? null : new Date().toISOString(),
      source,
    });
  } catch (err) {
    console.error("Register face error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/*
-----------------------------------
ADMIN/PARENT: REGISTER/CLEAR FACE PROFILE
-----------------------------------
*/
app.post("/admin/register-face/:id", registerFaceProfileHandler);
app.post("/parent/register-face/:id", registerFaceProfileHandler);
app.post("/register-face/:id", registerFaceProfileHandler);

/*
-----------------------------------
ADMIN: FORCE DEPART STUDENT
-----------------------------------
*/
app.post("/admin/force-depart/:id", async (req, res) => {
  try {
    const student_id = req.params.id;

    const { data: student, error: fetchError } = await supabase
      .from("students")
      .select("*")
      .eq("id", student_id)
      .single();

    if (fetchError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    if (isDepartedStatus(student.status)) {
      return res.json({ message: "Student already departed" });
    }

    const { error } = await supabase
      .from("students")
      .update({
        status: "DEPARTED",
        token: null,
        pickup_pin: null,
        pin_expires_at: null,
        departed_at: new Date().toISOString(),
        verification_type: "ADMIN",
      })
      .eq("id", student_id);

    if (error) throw error;

    res.json({
      status: "DEPARTED",
      message: "Student forcefully marked as departed",
    });
  } catch (err) {
    console.error("Force depart error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
-----------------------------------
ADMIN: RESET SINGLE STUDENT
-----------------------------------
*/
app.post("/admin/reset-student/:id", async (req, res) => {
  try {
    const student_id = req.params.id;

    const { error } = await supabase
      .from("students")
      .update({
        status: "NOT_ARRIVED",
        token: null,
        pickup_pin: null,
        pin_expires_at: null,
        arrived_at: null,
        departed_at: null,
        verification_type: null,
      })
      .eq("id", student_id);

    if (error) throw error;

    res.json({
      message: "Student reset successfully",
    });
  } catch (err) {
    console.error("Reset student error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
-----------------------------------
GET DATA
-----------------------------------
*/

/*
-----------------------------------
GET ALL STUDENTS (ADMIN VIEW)
-----------------------------------
*/
app.get("/students", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data.map((student) => mergeFaceProfile(student)) : [];
    res.json(rows);
  } catch (err) {
    console.error("Fetch students error:", err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

app.get("/students/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) throw error;

    res.json(mergeFaceProfile(data));
  } catch (err) {
    console.error("Fetch student error:", err);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

/*
-----------------------------------
RESET ENTIRE SYSTEM
-----------------------------------
*/
app.post("/reset", async (req, res) => {
  try {
    const { error } = await supabase
      .from("students")
      .update({
        status: "NOT_ARRIVED",
        token: null,
        pickup_pin: null,
        pin_expires_at: null,
        arrived_at: null,
        departed_at: null,
        verification_type: null,
      })
      .not("id", "is", null);

    if (error) {
      console.error("Reset error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      message: "System reset successful",
    });
  } catch (err) {
    console.error("Reset server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Keep API errors machine-readable for frontend handling.
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

/*
-----------------------------------
START SERVER
-----------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP() || "localhost";
  console.log(`🚀 Server running on 0.0.0.0:${PORT}`);
  console.log(`🌐 Local Network URL: http://${ip}:${PORT}`);
  console.log(`🏠 Loopback URL: http://localhost:${PORT}`);
});
