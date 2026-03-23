import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const app = express();

app.get("/User", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "User"'); // 注意双引号
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.toString());
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));