import { populate } from "dotenv";
import express from "express";
import pkg from 'pg';
import { connectionString } from "pg/lib/defaults";

const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URl
});

const app = express();

app.get("/User", aysnc (req, res) => {
    try{
        const result = await pool.query('SELECT * FROM User');
        res.json(result.rows); 
    } catch (err) {
        res.status(500).send(err.toString());
    }
});



app.listen(process.env.PORT || 3000);