const express = require("express");
const cors = require("cors");
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
app.use(express.json());

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

    if (student.status === "ARRIVED") {
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
ADMIN APIs
-----------------------------------
*/

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

    if (student.status === "DEPARTED") {
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

    res.json(data);
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

    res.json(data);
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
