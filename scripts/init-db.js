
const bcrypt = require('bcrypt');
const { run } = require('../src/db');

async function main(){
  try{
    await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT CHECK(role IN ('admin','staff')) NOT NULL DEFAULT 'staff', name TEXT, phone TEXT, created_at TEXT DEFAULT (datetime('now')))`);
    await run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    await run(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, method TEXT, amount_net REAL, vat_rate REAL, amount_vat REAL, amount_total REAL, note TEXT, user_id INTEGER, contract_type TEXT, contract_id INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
    await run(`CREATE TABLE IF NOT EXISTS contracts_temp (id INTEGER PRIMARY KEY AUTOINCREMENT, party1 TEXT, party2_employee_name TEXT, party2_profession TEXT, party2_monthly_salary REAL, party3 TEXT, terms TEXT, signature_party1_path TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
    await run(`CREATE TABLE IF NOT EXISTS contracts_perm (id INTEGER PRIMARY KEY AUTOINCREMENT, party1 TEXT, sponsor_name TEXT, sponsor_phone TEXT, sponsor_nationality TEXT, sponsor_address TEXT, sponsor_id_path TEXT, sponsor_passport_path TEXT, employee_name TEXT, employee_phone TEXT, employee_passport_path TEXT, employee_id_path TEXT, amount REAL, date_from TEXT, date_to TEXT, has_warranty INTEGER, warranty_duration TEXT, office_terms TEXT, sign_sponsor_path TEXT, sign_office_path TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
    await run(`INSERT OR IGNORE INTO settings(key,value) VALUES ('brand_name','سونا للتوظيف - العين'), ('vat_rate','5'), ('vat_visible','1'), ('vat_number','1000000000')`);
    const hash = await require('bcrypt').hash('sona', 10);
    await run(`INSERT OR IGNORE INTO users(username, password_hash, role, name) VALUES ('sona', ?, 'admin', 'Sona Admin')`, [hash]);
    console.log('DB ready. Login: sona / sona');
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
}
main();
