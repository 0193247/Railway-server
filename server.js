import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
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

app.get("/", (req, res) => {
  res.json({ ok: true, service: "Guidance Auth API" });
});

app.get("/User", async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT "id", "Name", "Interest" FROM "User" ORDER BY "id"'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { id, name } = req.body ?? {};

    if (!Number.isInteger(id) || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "id (integer) and name (string) are required"
      });
    }

    const result = await pool.query(
      'SELECT "id", "Name" FROM "User" WHERE "id" = $1 AND "Name" = $2 LIMIT 1',
      [id, name.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid serial or name"
      });
    }

    return res.json({
      success: true,
      message: "Login success",
      user: {
        id: result.rows[0].id,
        name: result.rows[0].Name
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
      'INSERT INTO "User" ("Name") VALUES ($1) RETURNING "id", "Name"',
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
        name: row.Name
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await ensureRegisterIpTable();
  } catch (e) {
    console.error("ensureRegisterIpTable failed:", e);
  }
  console.log(`Server running on port ${PORT}`);
});
