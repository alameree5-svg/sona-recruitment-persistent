
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'storage');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'data.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params=[]) { return new Promise((res, rej)=> db.run(sql, params, function(e){ e?rej(e):res(this); })); }
function get(sql, params=[]) { return new Promise((res, rej)=> db.get(sql, params, function(e, row){ e?rej(e):res(row); })); }
function all(sql, params=[]) { return new Promise((res, rej)=> db.all(sql, params, function(e, rows){ e?rej(e):res(rows); })); }

module.exports = { db, run, get, all, DATA_DIR };
