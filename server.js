/* 
  In Postgres:
    - "User"
      - id: serial
      - name: text
      - interest: text
  In Node.js:
    - require DATABASE_URL
    - require express, pg
*/

import express from "express";
import {Pool} from "pg";

// Postgres 连接串
const DATABASE_URL = process.env.DATABASE_URL;

// 判定数据库连接串是否为空
if (!DATABASE_URL || !String(DATABASE_URL).trim()) {
  console.error("FATAL: DATABASE_URL is empty.");
  process.exit(1);
}

// 数据库连接池
const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
// 自动解析 body 为 json
app.use(express.json());

// 获取用户资料
app.get("/api/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);       // 以十进制解析
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: "invalid id" });
    }
    // 查询
    const result = await pool.query(
      'SELECT id, name, COALESCE(interest, \'\') AS interest FROM "User" WHERE id = $1 LIMIT 1',
      [id]
    );
    // 查询结果为空
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "user not found" });
    }
    // 查询结果为第一行
    const row = result.rows[0];
    // 返回查询结果
    return res.json({
      id: row.id,
      name: row.name,
      interest: row.interest ?? ""
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

// 更新 interest
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

// 登录
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

// 注册
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required"
      });
    }

    const insertUser = await pool.query(
      'INSERT INTO "User" (name) VALUES ($1) RETURNING id, name, COALESCE(interest, \'\') AS interest',
      [name.trim()]
    );

    const row = insertUser.rows[0];

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

// 监听端口：Railway 通常会注入 PORT，本地默认 3000。
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
