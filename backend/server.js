const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const { MongoClient } = require("mongodb");
const { getLocalIP } = require("./utils/network");

const app = express();
const PORT = 3000;

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const MONGODB_DB_NAME = process.env.MONGODB_DB || process.env.MONGO_DB || "student_tracker";
const mongoClient = new MongoClient(MONGODB_URI);
let mongoDatabasePromise = null;

const PIN_EXPIRY_MS = 10 * 60 * 1000;

const RFID_FIELDS = [
  "card_id",
  "card_uid",
  "rfid_uid",
  "nfc_uid",
  "tap_card_id",
  "student_card_id",
  "student_number",
];

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/config", (req, res) => {
  const ip = getLocalIP() || "localhost";
  res.json({ baseUrl: `http://${ip}:${PORT}`, database: "mongodb", mongoDatabase: MONGODB_DB_NAME });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function normalize(value) {
  return String(value || "").trim();
}

function parseStudentCardPair(rawValue) {
  const value = normalize(rawValue);
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

function toPlainObject(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

function valuesMatch(left, right) {
  return normalize(left) === normalize(right);
}

async function getMongoDatabase() {
  if (!mongoDatabasePromise) {
    mongoDatabasePromise = mongoClient.connect().then((client) => client.db(MONGODB_DB_NAME));
  }

  return mongoDatabasePromise;
}

async function getMongoCollection(name) {
  const database = await getMongoDatabase();
  return database.collection(name);
}

async function readCollectionDocuments(name) {
  const collection = await getMongoCollection(name);
  return collection.find({}).toArray();
}

function filterDocuments(documents, filters) {
  return documents.filter((doc) =>
    filters.every((filter) => {
      const currentValue = doc?.[filter.field];
      if (filter.op === "eq") {
        return valuesMatch(currentValue, filter.value);
      }
      return !valuesMatch(currentValue, filter.value);
    }),
  );
}

function createCollectionQueryBuilder(collectionName) {
  const state = {
    operation: "select",
    filters: [],
    updateData: null,
    insertData: null,
    returnRows: false,
  };

  const builder = {
    select() {
      state.returnRows = true;
      return builder;
    },
    eq(field, value) {
      state.filters.push({ field, op: "eq", value });
      return builder;
    },
    neq(field, value) {
      state.filters.push({ field, op: "neq", value });
      return builder;
    },
    update(data) {
      state.operation = "update";
      state.updateData = data;
      return builder;
    },
    insert(data) {
      state.operation = "insert";
      state.insertData = data;
      return builder;
    },
    async maybeSingle() {
      const result = await execute();
      return { data: result[0] || null, error: null };
    },
    async single() {
      const result = await execute();

      if (result.length === 1) {
        return { data: result[0], error: null };
      }

      if (result.length === 0) {
        return { data: null, error: new Error(`No documents found in ${collectionName}`) };
      }

      return { data: null, error: new Error(`Multiple documents found in ${collectionName}`) };
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
  };

  async function execute() {
    const collection = await getMongoCollection(collectionName);

    if (state.operation === "insert") {
      const payload = Array.isArray(state.insertData) ? state.insertData : [state.insertData];
      const documents = payload.map((item) => ({ ...item }));
      await collection.insertMany(documents);
      return state.returnRows ? documents.map(toPlainObject) : [];
    }

    const documents = await readCollectionDocuments(collectionName);
    const matchedDocuments = filterDocuments(documents, state.filters);
    const filteredDocuments = matchedDocuments.map(toPlainObject);

    if (state.operation === "update") {
      if (matchedDocuments.length === 0) {
        return [];
      }

      const updateData = { ...state.updateData };
      await Promise.all(
        matchedDocuments.map((doc) => collection.updateOne({ _id: doc._id }, { $set: updateData })),
      );

      if (!state.returnRows) {
        return [];
      }

      return matchedDocuments.map((doc) => toPlainObject({ ...doc, ...updateData }));
    }

    return filteredDocuments;
  }

  return builder;
}

async function findStudentById(studentId) {
  const studentIdText = normalize(studentId);
  const documents = await readCollectionDocuments("students");
  return (
    documents.find((student) => valuesMatch(student.id, studentIdText)) ||
    documents.find((student) => valuesMatch(student.student_id, studentIdText)) ||
    null
  );
}

async function findUserByEmail(email) {
  const documents = await readCollectionDocuments("users");
  const normalizedEmail = normalize(email).toLowerCase();
  return documents.find((user) => normalize(user.email).toLowerCase() === normalizedEmail) || null;
}

async function findUserById(id) {
  const idText = normalize(id);
  const documents = await readCollectionDocuments("users");
  return documents.find((user) => valuesMatch(user.id, idText)) || null;
}

async function ensureDefaultAdminAccount() {
  const usersCollection = await getMongoCollection("users");
  const existingAdmin = await usersCollection.findOne({ user_type: "admin" });

  if (existingAdmin) {
    return;
  }

  const adminUser = {
    id: process.env.ADMIN_ID || "ADMIN-001",
    email: normalize(process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase(),
    password: process.env.ADMIN_PASSWORD || "admin123",
    user_type: "admin",
  };

  await usersCollection.insertOne(adminUser);
  console.log(`Seeded default admin account: ${adminUser.email}`);
}

const dataStore = {
  from(collectionName) {
    return createCollectionQueryBuilder(collectionName);
  },
  auth: {
    async signInWithPassword({ email, password }) {
      const user = await findUserByEmail(email);

      if (!user || !valuesMatch(user.password, password)) {
        return {
          data: { user: null, session: null },
          error: new Error("Invalid credentials"),
        };
      }

      return {
        data: {
          user: toPlainObject(user),
          session: {
            access_token: randomUUID(),
            refresh_token: randomUUID(),
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
            token_type: "bearer",
          },
        },
        error: null,
      };
    },
    admin: {
      async signOut() {
        return { data: null, error: null };
      },
    },
  },
};

async function getStudentById(studentId) {
  const student = await findStudentById(studentId);
  return student ? toPlainObject(student) : null;
}

async function updateStudentById(studentId, updates) {
  const student = await findStudentById(studentId);
  if (!student?._id) {
    return { error: null, matchedCount: 0 };
  }

  const studentsCollection = await getMongoCollection("students");
  const result = await studentsCollection.updateOne({ _id: student._id }, { $set: { ...updates } });
  return { error: null, matchedCount: result.matchedCount };
}

function buildStudentResetUpdates() {
  return {
    status: "NOT_ARRIVED",
    arrived_at: null,
    departed_at: null,
    verification_type: null,
    token: "",
    pickup_pin: null,
    pin_expires_at: null,
  };
}

function getBearerToken(req) {
  const authHeader = normalize(req.headers?.authorization);
  if (!authHeader) return "";

  const [scheme, token] = authHeader.split(" ");
  if (normalize(scheme).toLowerCase() !== "bearer") return "";
  return normalize(token);
}

function normalizeStatus(value) {
  return normalize(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function isNotArrived(status) {
  const normalized = normalizeStatus(status);
  return normalized === "NOT_ARRIVED" || normalized === "";
}

function isArrived(status) {
  return normalizeStatus(status) === "ARRIVED";
}

function isDeparted(status) {
  return normalizeStatus(status) === "DEPARTED";
}

function studentRfidMatches(student, rfidValue) {
  const wanted = normalize(rfidValue).toLowerCase();
  if (!wanted) return false;

  return RFID_FIELDS.some((field) => {
    const value = normalize(student?.[field]).toLowerCase();
    return value !== "" && value === wanted;
  });
}

function buildArrivalUpdate(verificationType = "RFID") {
  return {
    status: "ARRIVED",
    arrived_at: new Date().toISOString(),
    departed_at: null,
    verification_type: verificationType,
  };
}

function buildDepartureUpdate(verificationType = "RFID") {
  return {
    status: "DEPARTED",
    departed_at: new Date().toISOString(),
    verification_type: verificationType,
    token: "",
    pickup_pin: null,
    pin_expires_at: null,
  };
}

async function createPendingParentApproval(student, { clearToken = false, clearPin = false } = {}) {
  const existingRequestId = normalize(student?.departure_request_id);
  const requestId = existingRequestId || randomUUID();
  const updates = {
    departure_request_id: requestId,
    departure_request_status: "PENDING_PARENT_APPROVAL",
  };

  if (clearToken) {
    updates.token = "";
  }

  if (clearPin) {
    updates.pickup_pin = null;
    updates.pin_expires_at = null;
  }

  const { error } = await updateStudentById(student.id, updates);
  return { error, requestId };
}

async function processRfidVerification({ studentId, rfidValue, mode }) {
  const student = await getStudentById(studentId);

  if (!student) {
    return {
      status: 404,
      body: {
        status: "ERROR",
        message: "Student not found",
      },
    };
  }

  if (!studentRfidMatches(student, rfidValue)) {
    return {
      status: 401,
      body: {
        status: "ERROR",
        message: "RFID does not match this student",
        student_id: student.id,
      },
    };
  }

  const normalizedMode = normalize(mode).toUpperCase();
  const currentStatus = normalizeStatus(student.status);

  if (normalizedMode === "ARRIVAL" || (normalizedMode === "" && isNotArrived(student.status))) {
    const { error: updateError } = await updateStudentById(student.id, {
      ...buildArrivalUpdate(),
      verification_type: "RFID",
    });

    if (updateError) {
      return {
        status: 500,
        body: {
          status: "ERROR",
          message: "Failed to update student arrival status",
          details: updateError.message,
        },
      };
    }

    return {
      status: 200,
      body: {
        status: "ARRIVED",
        action: "CHECKED_IN",
        previous_status: currentStatus || "NOT_ARRIVED",
        student_id: student.id,
        student_name: student.name,
        message: "RFID verified. Student checked in.",
      },
    };
  }

  if (normalizedMode === "DEPARTURE" || (normalizedMode === "" && isArrived(student.status))) {
    if (!isArrived(student.status)) {
      return {
        status: 409,
        body: {
          status: "ERROR",
          student_id: student.id,
          student_name: student.name,
          message: `Unsupported current status: ${student.status}`,
        },
      };
    }

    const parent2faEnabled = Boolean(student.parent_2fa_enabled);

    if (parent2faEnabled) {
      const { error: pendingError, requestId } = await createPendingParentApproval(student);

      if (pendingError) {
        return {
          status: 500,
          body: {
            status: "ERROR",
            message: "Failed to create departure request",
            details: pendingError.message,
          },
        };
      }

      return {
        status: 200,
        body: {
          status: "PENDING_PARENT_APPROVAL",
          action: "REQUESTED_PARENT_APPROVAL",
          previous_status: currentStatus || "ARRIVED",
          student_id: student.id,
          student_name: student.name,
          request_id: requestId,
          requires_parent_id: true,
          message: "RFID verified. Parent ID approval is required for departure.",
        },
      };
    }

    const { error: updateError } = await updateStudentById(student.id, buildDepartureUpdate());

    if (updateError) {
      return {
        status: 500,
        body: {
          status: "ERROR",
          message: "Failed to update student departure status",
          details: updateError.message,
        },
      };
    }

    return {
      status: 200,
      body: {
        status: "DEPARTED",
        action: "CHECKED_OUT",
        previous_status: currentStatus || "ARRIVED",
        student_id: student.id,
        student_name: student.name,
        message: "RFID verified. Student checked out.",
      },
    };
  }

  if (isDeparted(student.status)) {
    return {
      status: 200,
      body: {
        status: "DEPARTED",
        action: "NO_CHANGE",
        previous_status: "DEPARTED",
        student_id: student.id,
        student_name: student.name,
        message: "Student already departed",
      },
    };
  }

  return {
    status: 409,
    body: {
      status: "ERROR",
      student_id: student.id,
      student_name: student.name,
      message: `Unsupported current status: ${student.status}`,
    },
  };
}

async function respondFromRfidVerification(req, res, options = {}) {
  try {
    const combinedScan = normalize(
      options.combinedScan ?? req.params.scan_payload ?? req.body?.scan_value ?? req.body?.scan ?? req.body?.value,
    );
    let studentId = normalize(options.studentId ?? req.params.student_id ?? req.body?.student_id);
    let rfidValue = normalize(options.rfidValue ?? req.params.card_id ?? req.body?.rfid_value ?? req.body?.card_id);
    const mode = normalize(options.mode ?? req.body?.mode ?? "");

    if (combinedScan && (!studentId || !rfidValue)) {
      const parsed = parseStudentCardPair(combinedScan);
      if (parsed) {
        studentId = studentId || parsed.studentId;
        rfidValue = rfidValue || parsed.cardId;
      }
    }

    if (!studentId || !rfidValue) {
      return res.status(400).json({ error: "student_id and card_id are required", format: "<student_id>:<card_id>" });
    }

    const result = await processRfidVerification({ studentId, rfidValue, mode });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("RFID verification error:", err);
    return res.status(500).json({ error: "RFID verification failed", details: err?.message || null });
  }
}

async function handleRfidScan(req, res) {
  return respondFromRfidVerification(req, res, {
    combinedScan: req.params.scan_payload,
    studentId: req.params.student_id,
    rfidValue: req.params.card_id,
  });
}

app.post("/auth/login", async (req, res) => {
  try {
    const email = normalize(req.body?.email).toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const { data, error } = await dataStore.auth.signInWithPassword({ email, password });

    if (error || !data?.session) {
      return res.status(401).json({
        status: "ERROR",
        message: "Invalid credentials",
        details: error?.message || null,
      });
    }

    return res.json({
      status: "OK",
      message: "Login successful",
      user: data.user,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Login failed",
      details: err?.message || null,
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const email = normalize(req.body?.email).toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const { data: user, error } = await dataStore
      .from("users")
      .select("id, email, user_type, student_id")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({ user });
  } catch (err) {
    console.error("Legacy login error:", err);
    return res.status(500).json({ error: "Login error" });
  }
});

app.post("/auth/logout", async (req, res) => {
  try {
    const accessToken = normalize(req.body?.access_token || getBearerToken(req));
    if (!accessToken) {
      return res.status(400).json({
        error: "access_token is required (body or Authorization: Bearer <token>)",
      });
    }

    const { error } = await dataStore.auth.admin.signOut(accessToken);
    if (error) {
      return res.status(400).json({
        status: "ERROR",
        message: "Logout failed",
        details: error.message,
      });
    }

    return res.json({ status: "OK", message: "Logout successful" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Logout failed",
      details: err?.message || null,
    });
  }
});

app.post("/logout", async (req, res) => {
  try {
    const accessToken = normalize(req.body?.access_token || getBearerToken(req));

    if (accessToken) {
      const { error } = await dataStore.auth.admin.signOut(accessToken);
      if (error) {
        return res.status(400).json({
          status: "ERROR",
          message: "Logout failed",
          details: error.message,
        });
      }
    }

    return res.json({ status: "OK", message: "Logout successful" });
  } catch (err) {
    console.error("Legacy logout error:", err);
    return res.status(500).json({ error: "Logout error" });
  }
});

// Supports both legacy split scans and the new combined <student_id>:<card_id> format.
app.post("/rfid/scan/:scan_payload", handleRfidScan);
app.get("/rfid/scan/:scan_payload", handleRfidScan);
app.post("/rfid/scan/:student_id/:card_id", handleRfidScan);
app.get("/rfid/scan/:student_id/:card_id", handleRfidScan);

app.get("/students", async (_req, res) => {
  try {
    const data = await readCollectionDocuments("students");
    return res.json(data);
  } catch (err) {
    console.error("Fetch students error:", err);
    return res.status(500).json({ error: "Failed to fetch students", details: err?.message || null });
  }
});

app.post("/register", async (req, res) => {
  try {
    const userType = normalize(req.body?.user_type).toLowerCase();

    if (!["family", "student", "parent", "admin"].includes(userType)) {
      return res.status(400).json({ error: "Invalid user_type." });
    }

    if (userType === "family") {
      const parentName = normalize(req.body?.parent_name);
      const parentId = normalize(req.body?.parent_id);
      const parentEmail = normalize(req.body?.parent_email).toLowerCase();
      const parentPassword = String(req.body?.parent_password || "");
      const studentName = normalize(req.body?.student_name);
      const studentId = normalize(req.body?.student_id);
      const cardId = normalize(req.body?.card_id);

      if (!parentName || !parentId || !parentEmail || !parentPassword || !studentName || !studentId || !cardId) {
        return res.status(400).json({
          error: "Parent name, parent id, parent email, parent password, student name, student_id, and card_id are required.",
        });
      }

      const { data: existingParentEmail, error: parentEmailLookupError } = await dataStore
        .from("users")
        .select("id")
        .eq("email", parentEmail)
        .maybeSingle();

      if (parentEmailLookupError) {
        return res.status(500).json({ error: "Failed to check parent email uniqueness.", details: parentEmailLookupError.message });
      }

      if (existingParentEmail) {
        return res.status(409).json({ error: "Parent email is already registered." });
      }

      const { data: existingParentId, error: parentIdLookupError } = await dataStore
        .from("users")
        .select("id")
        .eq("id", parentId)
        .maybeSingle();

      if (parentIdLookupError) {
        return res.status(500).json({ error: "Failed to check parent id uniqueness.", details: parentIdLookupError.message });
      }

      if (existingParentId) {
        return res.status(409).json({ error: "Parent ID already exists." });
      }

      const existingStudent = await findStudentById(studentId);
      if (existingStudent) {
        return res.status(409).json({ error: "Student ID already exists." });
      }

      const parentUser = {
        id: parentId,
        email: parentEmail,
        password: parentPassword,
        user_type: "parent",
        student_id: studentId,
        student_name: studentName,
        name: parentName,
      };

      const usersCollection = await getMongoCollection("users");
      const studentsCollection = await getMongoCollection("students");

      try {
        await usersCollection.insertOne(parentUser);
        await studentsCollection.insertOne({
          id: studentId,
          name: studentName,
          parent_id: parentId,
          parent_name: parentName,
          parent_email: parentEmail,
          parent_2fa_enabled: false,
          card_id: cardId,
          status: "NOT_ARRIVED",
          arrived_at: null,
          departed_at: null,
          verification_type: null,
          token: "",
          pickup_pin: null,
          pin_expires_at: null,
          face_url: "",
          face_verified: false,
          face_verified_at: null,
        });
      } catch (error) {
        await usersCollection.deleteOne({ id: parentId });
        await studentsCollection.deleteOne({ id: studentId });
        throw error;
      }

      return res.status(201).json({
        user: {
          id: parentUser.id,
          email: parentUser.email,
          user_type: parentUser.user_type,
          student_id: parentUser.student_id,
          student_name: parentUser.student_name,
        },
      });
    }

    const email = normalize(req.body?.email).toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const { data: existingByEmail, error: emailLookupError } = await dataStore
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (emailLookupError) {
      return res.status(500).json({ error: "Failed to check email uniqueness.", details: emailLookupError.message });
    }

    if (existingByEmail) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    let user;

    if (userType === "family") {
      const parentName = normalize(req.body?.parent_name);
      const parentId = normalize(req.body?.parent_id);
      const parentEmail = normalize(req.body?.parent_email).toLowerCase();
      const parentPassword = String(req.body?.parent_password || "");
      const studentName = normalize(req.body?.student_name);
      const studentId = normalize(req.body?.student_id);
      const cardId = normalize(req.body?.card_id);

      if (!parentName || !parentId || !parentEmail || !parentPassword || !studentName || !studentId || !cardId) {
        return res.status(400).json({
          error: "Parent name, parent id, parent email, parent password, student name, student_id, and card_id are required.",
        });
      }

      const { data: existingParentEmail, error: parentEmailLookupError } = await dataStore
        .from("users")
        .select("id")
        .eq("email", parentEmail)
        .maybeSingle();

      if (parentEmailLookupError) {
        return res.status(500).json({ error: "Failed to check parent email uniqueness.", details: parentEmailLookupError.message });
      }

      if (existingParentEmail) {
        return res.status(409).json({ error: "Parent email is already registered." });
      }

      const { data: existingParentId, error: parentIdLookupError } = await dataStore
        .from("users")
        .select("id")
        .eq("id", parentId)
        .maybeSingle();

      if (parentIdLookupError) {
        return res.status(500).json({ error: "Failed to check parent id uniqueness.", details: parentIdLookupError.message });
      }

      if (existingParentId) {
        return res.status(409).json({ error: "Parent ID already exists." });
      }

      const existingStudent = await findStudentById(studentId);
      if (existingStudent) {
        return res.status(409).json({ error: "Student ID already exists." });
      }

      const parentUser = {
        id: parentId,
        email: parentEmail,
        password: parentPassword,
        user_type: "parent",
        student_id: studentId,
        student_name: studentName,
        name: parentName,
      };

      const usersCollection = await getMongoCollection("users");
      const studentsCollection = await getMongoCollection("students");

      try {
        await usersCollection.insertOne(parentUser);
        await studentsCollection.insertOne({
          id: studentId,
          name: studentName,
          parent_id: parentId,
          parent_name: parentName,
          parent_email: parentEmail,
          parent_2fa_enabled: false,
          card_id: cardId,
          status: "NOT_ARRIVED",
          arrived_at: null,
          departed_at: null,
          verification_type: null,
          token: "",
          pickup_pin: null,
          pin_expires_at: null,
          face_url: "",
          face_verified: false,
          face_verified_at: null,
        });
      } catch (error) {
        await usersCollection.deleteOne({ id: parentId });
        await studentsCollection.deleteOne({ id: studentId });
        throw error;
      }

      return res.status(201).json({
        user: {
          id: parentUser.id,
          email: parentUser.email,
          user_type: parentUser.user_type,
          student_id: parentUser.student_id,
          student_name: parentUser.student_name,
        },
      });
    }

    if (userType === "student") {
      const studentName = normalize(req.body?.name);
      const studentId = normalize(req.body?.student_id);
      const cardId = normalize(req.body?.card_id);

      if (!studentName || !studentId || !cardId) {
        return res.status(400).json({ error: "Student name, student_id, and card_id are required." });
      }

      const existingStudent = await findStudentById(studentId);
      if (existingStudent) {
        return res.status(409).json({ error: "Student ID already exists." });
      }

      user = {
        id: studentId,
        email,
        password,
        user_type: "student",
        student_id: studentId,
        card_id: cardId,
        name: studentName,
      };

      const studentsCollection = await getMongoCollection("students");
      await studentsCollection.insertOne({
        id: studentId,
        name: studentName,
        parent_2fa_enabled: false,
        card_id: cardId,
        status: "NOT_ARRIVED",
        arrived_at: null,
        departed_at: null,
        verification_type: null,
        token: "",
        pickup_pin: null,
        pin_expires_at: null,
        face_url: "",
        face_verified: false,
        face_verified_at: null,
      });
    } else if (userType === "parent") {
      const id = normalize(req.body?.id);
      const associatedStudentId = normalize(req.body?.student_id);

      if (!id || !associatedStudentId) {
        return res.status(400).json({ error: "Parent id and student_id are required." });
      }

      const student = await getStudentById(associatedStudentId);
      if (!student) {
        return res.status(404).json({ error: "Associated student_id not found." });
      }

      const { data: existingById, error: idLookupError } = await dataStore
        .from("users")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (idLookupError) {
        return res.status(500).json({ error: "Failed to check parent id uniqueness.", details: idLookupError.message });
      }

      if (existingById) {
        return res.status(409).json({ error: "ID already exists." });
      }

      user = {
        id,
        email,
        password,
        user_type: "parent",
        student_id: associatedStudentId,
      };
    } else {
      const id = normalize(req.body?.id);

      if (!id) {
        return res.status(400).json({ error: "Admin id is required." });
      }

      const { data: existingById, error: idLookupError } = await dataStore
        .from("users")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (idLookupError) {
        return res.status(500).json({ error: "Failed to check admin id uniqueness.", details: idLookupError.message });
      }

      if (existingById) {
        return res.status(409).json({ error: "ID already exists." });
      }

      user = {
        id,
        email,
        password,
        user_type: "admin",
      };
    }

    const usersCollection = await getMongoCollection("users");
    await usersCollection.insertOne(user);

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        student_id: user.student_id || null,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Registration failed", details: err?.message || null });
  }
});

app.post("/forgot-password", async (req, res) => {
  try {
    const email = normalize(req.body?.email).toLowerCase();
    const newPassword = String(req.body?.newPassword || "");

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and newPassword are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const { data, error } = await dataStore
      .from("users")
      .update({ password: newPassword })
      .eq("email", email)
      .select("id")
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: "Failed to update password.", details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Email not found." });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Password reset failed", details: err?.message || null });
  }
});

app.post("/checkin/:studentId/:sessionToken", async (req, res) => {
  try {
    const studentId = normalize(req.params.studentId);
    const sessionToken = normalize(req.params.sessionToken);

    if (!studentId || !sessionToken) {
      return res.status(400).json({ error: "Session token is required." });
    }

    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const { error } = await updateStudentById(student.id, {
      ...buildArrivalUpdate("QR"),
      token: sessionToken,
    });

    if (error) {
      return res.status(500).json({ error: "Failed to check in student.", details: error.message });
    }

    return res.json({
      status: "ARRIVED",
      token: sessionToken,
      arrived_at: new Date().toISOString(),
      departured_at: null,
    });
  } catch (err) {
    console.error("Check-in error:", err);
    return res.status(500).json({ error: "Failed to check in student.", details: err?.message || null });
  }
});

app.post("/checkin-face/:studentId", async (req, res) => {
  try {
    const student = await getStudentById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const { error } = await updateStudentById(student.id, buildArrivalUpdate("FACE"));
    if (error) {
      return res.status(500).json({ error: "Failed to check in student.", details: error.message });
    }

    return res.json({
      status: "ARRIVED",
      student_id: student.id,
      student_name: student.name,
      message: "Face verified. Student checked in.",
    });
  } catch (err) {
    console.error("Face check-in error:", err);
    return res.status(500).json({ error: "Face check-in failed", details: err?.message || null });
  }
});

app.post("/generate-pin/:studentId", async (req, res) => {
  try {
    const student = await getStudentById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    if (!isArrived(student.status)) {
      return res.status(400).json({ error: "PIN can only be generated when student is ARRIVED." });
    }

    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + PIN_EXPIRY_MS).toISOString();

    const { error } = await updateStudentById(student.id, {
      pickup_pin: pin,
      pin_expires_at: expiresAt,
    });

    if (error) {
      return res.status(500).json({ error: "Failed to generate PIN.", details: error.message });
    }

    return res.json({ pin, pickup_pin: pin, expires_at: expiresAt });
  } catch (err) {
    console.error("Generate PIN error:", err);
    return res.status(500).json({ error: "Failed to generate PIN.", details: err?.message || null });
  }
});

app.post("/verify-pin", async (req, res) => {
  try {
    const pin = normalize(req.body?.pin);
    if (!pin) {
      return res.status(400).json({ error: "PIN is required." });
    }

    const { data: student, error } = await dataStore
      .from("students")
      .select("*")
      .eq("pickup_pin", pin)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: "Failed to verify PIN.", details: error.message });
    }

    if (!student) {
      return res.status(404).json({ error: "Invalid PIN." });
    }

    const expiresAt = normalize(student.pin_expires_at);
    if (expiresAt) {
      const expiresAtMs = new Date(expiresAt).getTime();
      if (!Number.isNaN(expiresAtMs) && expiresAtMs < Date.now()) {
        await updateStudentById(student.id, {
          pickup_pin: null,
          pin_expires_at: null,
        });
        return res.status(410).json({ status: "ERROR", message: "Expired PIN" });
      }
    }

    if (!isArrived(student.status)) {
      return res.status(409).json({ status: "ERROR", message: "PIN can only be used when student is ARRIVED." });
    }

    if (Boolean(student.parent_2fa_enabled)) {
      const { error: pendingError, requestId } = await createPendingParentApproval(student, { clearPin: true });
      if (pendingError) {
        return res.status(500).json({ error: "Failed to create departure request.", details: pendingError.message });
      }

      return res.json({
        status: "PENDING_PARENT_APPROVAL",
        student_id: student.id,
        student_name: student.name,
        request_id: requestId,
        requires_parent_id: true,
        message: "PIN verified. Parent ID approval is required for departure.",
      });
    }

    const { error: updateError } = await updateStudentById(student.id, {
      ...buildDepartureUpdate("PIN"),
      pickup_pin: null,
      pin_expires_at: null,
    });

    if (updateError) {
      return res.status(500).json({ error: "Failed to verify PIN.", details: updateError.message });
    }

    return res.json({
      status: "DEPARTED",
      student_id: student.id,
      student_name: student.name,
      message: "PIN verified. Student checked out.",
    });
  } catch (err) {
    console.error("Verify PIN error:", err);
    return res.status(500).json({ error: "Failed to verify PIN.", details: err?.message || null });
  }
});

app.post("/verify-departure/:studentId/:token", async (req, res) => {
  try {
    const studentId = normalize(req.params.studentId);
    const token = normalize(req.params.token);

    if (!studentId || !token) {
      return res.status(400).json({ error: "studentId and token are required." });
    }

    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    if (normalize(student.token) !== token) {
      return res.status(401).json({ status: "ERROR", message: "Invalid departure token." });
    }

    if (!isArrived(student.status)) {
      return res.status(409).json({ status: "ERROR", message: "Departure can only be verified when student is ARRIVED." });
    }

    const parent2faEnabled = Boolean(student.parent_2fa_enabled);

    if (parent2faEnabled) {
      const requestId = randomUUID();
      const { error } = await updateStudentById(student.id, {
        departure_request_id: requestId,
        departure_request_status: "PENDING_PARENT_APPROVAL",
        token: "",
      });

      if (error) {
        return res.status(500).json({ error: "Failed to create departure request.", details: error.message });
      }

      return res.json({
        status: "PENDING_PARENT_APPROVAL",
        student_id: student.id,
        student_name: student.name,
        request_id: requestId,
        requires_parent_id: true,
        message: "Parent verification required before departure.",
      });
    }

    const { error } = await updateStudentById(student.id, buildDepartureUpdate("QR"));
    if (error) {
      return res.status(500).json({ error: "Failed to verify departure.", details: error.message });
    }

    return res.json({
      status: "DEPARTED",
      student_id: student.id,
      student_name: student.name,
      message: "Departure verified successfully.",
    });
  } catch (err) {
    console.error("Verify departure error:", err);
    return res.status(500).json({ error: "Failed to verify departure.", details: err?.message || null });
  }
});

app.get("/parent/departure-request/:studentId", async (req, res) => {
  try {
    const student = await getStudentById(req.params.studentId);
    const requestStatus = normalize(student?.departure_request_status).toUpperCase();

    if (!student || requestStatus !== "PENDING_PARENT_APPROVAL") {
      return res.status(404).json({ error: "No pending departure request." });
    }

    return res.json({
      request_id: normalize(student.departure_request_id),
      student_id: student.id,
      student_name: student.name,
      status: requestStatus,
      requires_parent_id: Boolean(student.parent_2fa_enabled),
    });
  } catch (err) {
    console.error("Departure request lookup error:", err);
    return res.status(500).json({ error: "Failed to load departure request.", details: err?.message || null });
  }
});

app.post("/parent/verify-departure", async (req, res) => {
  try {
    const studentId = normalize(req.body?.student_id);
    const requestId = normalize(req.body?.request_id);
    const parentId = normalize(req.body?.parent_id);
    const approved = Boolean(req.body?.approved);

    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const requiresParentId = Boolean(student.parent_2fa_enabled);

    if (approved && requiresParentId && !parentId) {
      return res.status(400).json({ error: "parent_id is required." });
    }

    if (!requestId || normalize(student.departure_request_id) !== requestId) {
      return res.status(404).json({ error: "Departure request not found." });
    }

    if (approved) {
      if (requiresParentId) {
        const parent = await findUserById(parentId);
        if (!parent || normalize(parent.user_type).toLowerCase() !== "parent") {
          return res.status(404).json({ error: "Parent account not found." });
        }

        if (normalize(parent.student_id) !== normalize(student.id)) {
          return res.status(403).json({ error: "Parent id does not match this student." });
        }
      }

      const { error } = await updateStudentById(student.id, {
        ...buildDepartureUpdate("PARENT"),
        departure_request_id: null,
        departure_request_status: null,
      });

      if (error) {
        return res.status(500).json({ error: "Failed to approve departure.", details: error.message });
      }
    } else {
      const { error } = await updateStudentById(student.id, {
        departure_request_status: "REJECTED",
      });

      if (error) {
        return res.status(500).json({ error: "Failed to reject departure.", details: error.message });
      }
    }

    return res.json({ ok: true, approved });
  } catch (err) {
    console.error("Parent verify departure error:", err);
    return res.status(500).json({ error: "Failed to verify departure.", details: err?.message || null });
  }
});

async function setFaceProfile(req, res) {
  try {
    const student = await getStudentById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const clear = Boolean(req.body?.clear);
    const imageDataUrl = normalize(req.body?.imageDataUrl);

    if (clear) {
      const { error } = await updateStudentById(student.id, {
        face_url: "",
        face_verified: false,
        face_verified_at: null,
      });

      if (error) {
        return res.status(500).json({ error: "Failed to clear face profile.", details: error.message });
      }

      return res.json({ ok: true, cleared: true });
    }

    if (!imageDataUrl) {
      return res.status(400).json({ error: "imageDataUrl is required." });
    }

    const { error } = await updateStudentById(student.id, {
      face_url: imageDataUrl,
      face_verified: true,
      face_verified_at: new Date().toISOString(),
    });

    if (error) {
      return res.status(500).json({ error: "Failed to save face profile.", details: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Set face profile error:", err);
    return res.status(500).json({ error: "Failed to save face profile.", details: err?.message || null });
  }
}

app.post("/admin/register-face/:studentId", setFaceProfile);
app.post("/parent/register-face/:studentId", setFaceProfile);
app.post("/register-face/:studentId", setFaceProfile);

app.post("/admin/force-depart/:studentId", async (req, res) => {
  try {
    const student = await getStudentById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const { error } = await updateStudentById(student.id, {
      ...buildDepartureUpdate("ADMIN"),
      pickup_pin: null,
      pin_expires_at: null,
    });

    if (error) {
      return res.status(500).json({ error: "Failed to force depart student.", details: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Force depart error:", err);
    return res.status(500).json({ error: "Failed to force depart student.", details: err?.message || null });
  }
});

app.post("/admin/students/:studentId/parent-2fa", async (req, res) => {
  try {
    const studentId = normalize(req.params.studentId);
    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const enabled = Boolean(req.body?.enabled);
    const { error } = await updateStudentById(student.id, {
      parent_2fa_enabled: enabled,
    });

    if (error) {
      return res.status(500).json({ error: "Failed to update parent 2FA setting.", details: error.message });
    }

    return res.json({ ok: true, student_id: student.id, parent_2fa_enabled: enabled });
  } catch (err) {
    console.error("Update parent 2FA error:", err);
    return res.status(500).json({ error: "Failed to update parent 2FA setting.", details: err?.message || null });
  }
});

app.post("/admin/reset-student/:id", async (req, res) => {
  try {
    const studentId = normalize(req.params.id);
    if (!studentId) {
      return res.status(400).json({ error: "Student id is required" });
    }

    const { error } = await updateStudentById(studentId, {
      ...buildStudentResetUpdates(),
      face_url: "",
      face_verified: false,
      face_verified_at: null,
      departure_request_id: null,
      departure_request_status: null,
    });

    if (error) {
      return res.status(500).json({
        status: "ERROR",
        message: "Failed to reset student",
        details: error.message,
      });
    }

    res.json({ status: "OK", message: "Student reset successfully" });
  } catch (err) {
    console.error("Reset student error:", err);
    res.status(500).json({ error: "Failed to reset student" });
  }
});

app.post("/reset", async (_req, res) => {
  try {
    const { error } = await dataStore
      .from("students")
      .update({
        ...buildStudentResetUpdates(),
        face_url: "",
        face_verified: false,
        face_verified_at: null,
        departure_request_id: null,
        departure_request_status: null,
      })
      .neq("id", "");

    if (error) {
      return res.status(500).json({ error: "Failed to reset students", details: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Reset error:", err);
    return res.status(500).json({ error: "Failed to reset students", details: err?.message || null });
  }
});

app.get("/students/:id", async (req, res) => {
  try {
    const studentId = normalize(req.params.id);
    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json(student);
  } catch (err) {
    console.error("Fetch student error:", err);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

async function startServer() {
  try {
    await ensureDefaultAdminAccount();
  } catch (err) {
    console.error("Failed to seed default admin account:", err);
  }

  app.listen(PORT, "0.0.0.0", () => {
    const ip = getLocalIP() || "localhost";
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Local network URL: http://${ip}:${PORT}`);
  });
}

void startServer();
