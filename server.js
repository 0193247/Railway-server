// Guidance API（极简版）：登录/注册 + User.interest。
//
// 目标：只做“能用”的最小功能，不做复杂功能（不做建表/迁移/同 IP 限制/环境探测等）。
//
// 数据表约定（Postgres）：
// - 表名："User"
// - 字段：
//   - id: serial (主键)
//   - name: text
//   - interest: text (可空，兴趣 joined string，例如 "music&sleep")
//
// 运行要求：
// - 环境变量：DATABASE_URL（Postgres 连接串）
// - 依赖：express、pg、dotenv（dotenv 可选）

require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

// Postgres 连接串（必须提供，否则直接退出，避免服务假启动）。
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !String(DATABASE_URL).trim()) {
  console.error("FATAL: DATABASE_URL is empty.");
  process.exit(1);
}

// 数据库连接池：这里不做 SSL/railway 的自动推断，保持直线逻辑。
const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(express.json());

// 健康检查：用于快速确认服务是否在跑。
app.get("/", (req, res) => {
  res.json({ ok: true, service: "Guidance Auth API" });
});

// 获取用户资料（Yearning 页面用）。
// - path: GET /api/users/:id
// - return: { id, name, interest }
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

// 更新用户兴趣（interest 字符串）。
// - path: PATCH /api/users/:id/interest
// - body: { name: string, interest: string }
// - 规则：为了避免随便改别人数据，这里要求 body.name 必须和数据库中的 name 一致。
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

// 登录：用 (id + name) 做最简身份验证。
// - path: POST /api/auth/login
// - body: { id: number|string, name: string }
// - return: { success, message, user? }
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

// 注册：只提交 name，服务端插入一条 User，并返回分配到的 id。
// - path: POST /api/auth/register
// - body: { name: string }
// - return: { success, message, user }
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
