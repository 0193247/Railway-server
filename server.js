import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const app = express();
app.use(express.json());

// optional: health check
app.get("/", (req, res) => {
  res.json({ ok: true, service: "Guidance Auth API" });
});

// optional: list users
app.get("/User", async (req, res) => {
  try {
    const result = await pool.query('SELECT "id", "Name", "Interest" FROM "User" ORDER BY "id"');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.toString() });
  }
});

// Login: verify id + Name
app.post("/api/auth/login", async (req, res) => {
  try {
    const { id, name } = req.body ?? {};

    if (!Number.isInteger(id) || !name || typeof name !== "string") {
      return res.status(400).json({
        success: false,
        message: "id(integer) and name(string) are required"
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
    return res.status(500).json({ success: false, message: err.toString() });
  }
});

// Register: create user with Name, id uses serial/identity auto increment
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name } = req.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required"
      });
    }

    const result = await pool.query(
      'INSERT INTO "User" ("Name") VALUES ($1) RETURNING "id", "Name"',
      [name.trim()]
    );

    return res.status(201).json({
      success: true,
      message: "Register success",
      user: {
        id: result.rows[0].id,
        name: result.rows[0].Name
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));