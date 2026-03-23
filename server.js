/**
 * Guidance API: auth + User.interest (text, segments joined by & e.g. music&video+game&sleep).
 * Table "User": id serial, name text, interest text (nullable).
 * Merge into Railway Node or replace server.js after backup.
 */
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pkg from "pg";
const { Pool } = pkg;

function isLocalhostDatabaseUrl(url) {
  if (!url || typeof url !== "string") return true;
  const u = url.toLowerCase();
  return (
    u.includes("127.0.0.1") ||
    u.includes("@localhost") ||
    u.includes("://localhost") ||
    u.includes("::1")
  );
}

function assertDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_NAME
  );

  if (!url || !String(url).trim()) {
    const msg =
      "DATABASE_URL is empty. Link Postgres DATABASE_URL to this Web service on Railway.";
    if (onRailway) {
      console.error("FATAL:", msg);
      process.exit(1);
    }
    console.warn("WARN:", msg);
    return;
  }

  if (onRailway && isLocalhostDatabaseUrl(url)) {
    console.error(
      "FATAL: DATABASE_URL points to localhost; use Postgres plugin reference."
    );
    process.exit(1);
  }
}

assertDatabaseUrl();

function buildPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  const sslDisabled =
    process.env.PGSSLMODE === "disable" || process.env.DATABASE_SSL === "0";

  let ssl = undefined;
  if (connectionString && !sslDisabled) {
    const looksRemote =
      /amazonaws\.com|azure\.com|neon\.tech|supabase\.co|render\.com|railway\.app|rlwy\.net/i.test(
        connectionString
      );
    if (looksRemote || process.env.RAILWAY_ENVIRONMENT) {
      ssl = { rejectUnauthorized: false };
    }
  }

  return { connectionString, ssl, max: 10, connectionTimeoutMillis: 20000 };
}

const pool = new Pool(buildPoolConfig());

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

const app = express();
app.set("trust proxy", true);
app.use(express.json());

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  const ra = req.socket?.remoteAddress;
  return ra && ra.length > 0 ? ra : "unknown";
}

async function ensureRegisterIpTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "RegisterIp" (
      "ip" text PRIMARY KEY,
      "userId" integer NOT NULL
    );
  `);
}

/** interest column on "User" (lowercase name / interest — no quoted mixed case). */
async function ensureUserInterestColumn() {
  await pool.query(`
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS interest text;
  `);
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "Guidance Auth API" });
});

app.get("/User", async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, interest FROM "User" ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

/** Single user profile (for YearningWindow). */
app.get("/api/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: "invalid id" });
    }
    const result = await pool.query(
      'SELECT id, name, COALESCE(interest, \'\') AS interest FROM "User" WHERE id = $1 LIMIT 1',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "user not found" });
    }
    const row = result.rows[0];
    return res.json({
      id: row.id,
      name: row.name,
      interest: row.interest ?? ""
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

/**
 * Update interest string. Requires body.name to match DB (same as login identity).
 */
app.patch("/api/users/:id/interest", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, interest } = req.body ?? {};
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: "invalid id" });
    }
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "name required" });
    }
    if (typeof interest !== "string") {
      return res.status(400).json({ success: false, message: "interest must be string" });
    }

    const check = await pool.query(
      'SELECT id FROM "User" WHERE id = $1 AND name = $2 LIMIT 1',
      [id, name.trim()]
    );
    if (check.rowCount === 0) {
      return res.status(403).json({ success: false, message: "name does not match user" });
    }

    const upd = await pool.query(
      'UPDATE "User" SET interest = $1 WHERE id = $2 RETURNING id, name, COALESCE(interest, \'\') AS interest',
      [interest, id]
    );
    const row = upd.rows[0];
    return res.json({
      success: true,
      user: { id: row.id, name: row.name, interest: row.interest ?? "" }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    let { id, name } = req.body ?? {};
    if (typeof id === "string") id = parseInt(id, 10);
    if (!Number.isInteger(id) || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "id (integer) and name (string) are required"
      });
    }

    const result = await pool.query(
      'SELECT id, name, COALESCE(interest, \'\') AS interest FROM "User" WHERE id = $1 AND name = $2 LIMIT 1',
      [id, name.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid serial or name"
      });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      message: "Login success",
      user: {
        id: row.id,
        name: row.name,
        interest: row.interest ?? ""
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const ip = clientIp(req);
  try {
    await ensureRegisterIpTable();

    const { name } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required"
      });
    }

    const dup = await pool.query(
      'SELECT "userId" FROM "RegisterIp" WHERE "ip" = $1 LIMIT 1',
      [ip]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: "This network has already registered an account"
      });
    }

    const insertUser = await pool.query(
      'INSERT INTO "User" (name) VALUES ($1) RETURNING id, name, COALESCE(interest, \'\') AS interest',
      [name.trim()]
    );

    const row = insertUser.rows[0];
    await pool.query(
      'INSERT INTO "RegisterIp" ("ip", "userId") VALUES ($1, $2)',
      [ip, row.id]
    );

    return res.status(201).json({
      success: true,
      message: "Register success",
      user: {
        id: row.id,
        name: row.name,
        interest: row.interest ?? ""
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

function logErr(prefix, err) {
  if (err && err.name === "AggregateError" && Array.isArray(err.errors)) {
    console.error(prefix, err.message);
    err.errors.forEach((e, i) => console.error(`  [${i}]`, e));
    return;
  }
  console.error(prefix, err);
}

const PORT = process.env.PORT || 3000;

async function boot() {
  try {
    await ensureRegisterIpTable();
    await ensureUserInterestColumn();
  } catch (e) {
    logErr("DB init failed:", e);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

boot();
