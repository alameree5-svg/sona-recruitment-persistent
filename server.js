
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const db = require('./src/db');
const { run, get, all, DATA_DIR } = db;

const app = express();
const PORT = process.env.PORT || 3000;

// ensure dirs
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// views & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(methodOverride('_method'));
app.use(session({ secret: process.env.SESSION_SECRET || 'sona-secret', resave:false, saveUninitialized:false }));
app.use(flash());

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb)=> cb(null, UPLOADS_DIR),
  filename: (req, file, cb)=> cb(null, uuidv4() + (path.extname(file.originalname||'')))
});
const upload = multer({ storage });

// helpers
function requireAuth(req,res,next){ if(!req.session.user) return res.redirect('/login'); next(); }
function requireAdmin(req,res,next){ if(!req.session.user) return res.redirect('/login'); if(req.session.user.role!=='admin'){ req.flash('error','يتطلب صلاحيات المدير'); return res.redirect('/'); } next(); }
async function getSetting(key, def=null){ const r = await get('SELECT value FROM settings WHERE key=?',[key]); return r? r.value : def; }
async function setSetting(key,val){ const r=await get('SELECT key FROM settings WHERE key=?',[key]); if(r) await run('UPDATE settings SET value=? WHERE key=?',[String(val??''),key]); else await run('INSERT INTO settings(key,value) VALUES(?,?)',[key,String(val??'')]); }

app.use(async (req,res,next)=>{
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user;
  res.locals.brand_name = await getSetting('brand_name','سونا للتوظيف - العين');
  res.locals.vat_visible = await getSetting('vat_visible','1')==='1';
  res.locals.vat_number = await getSetting('vat_number','');
  res.locals.vat_rate = Number(await getSetting('vat_rate','5'));
  next();
});

// Auth
app.get('/login',(req,res)=> res.render('auth/login',{title:'تسجيل الدخول'}));
app.post('/login', async (req,res)=>{
  const { username, password } = req.body;
  const u = await get('SELECT * FROM users WHERE username=?',[username]);
  if(!u){ req.flash('error','بيانات الدخول غير صحيحة'); return res.redirect('/login'); }
  const ok = await bcrypt.compare(password, u.password_hash);
  if(!ok){ req.flash('error','بيانات الدخول غير صحيحة'); return res.redirect('/login'); }
  req.session.user = { id:u.id, username:u.username, role:u.role, name:u.name };
  req.flash('success','مرحباً بك!');
  res.redirect('/');
});
app.get('/logout',(req,res)=> req.session.destroy(()=>res.redirect('/login')));

// Dashboard
app.get('/', requireAuth, async (req,res)=>{
  const paymentsToday = await get(`SELECT COUNT(*) c, IFNULL(SUM(amount_total),0) t FROM payments WHERE date(date)=date('now')`);
  const tempCount = await get(`SELECT COUNT(*) c FROM contracts_temp`);
  const permCount = await get(`SELECT COUNT(*) c FROM contracts_perm`);
  res.render('dashboard', { title:'لوحة التحكم', paymentsToday, tempCount, permCount });
});

// Users
app.get('/users', requireAdmin, async (req,res)=> res.render('users/list', { title:'إدارة المستخدمين', users: await all('SELECT * FROM users ORDER BY id DESC') }));
app.get('/users/new', requireAdmin, (req,res)=> res.render('users/form', { title:'مستخدم جديد', userObj:{}, action:'/users', method:'POST' }));
app.post('/users', requireAdmin, async (req,res)=>{
  const { username, password, role, name, phone } = req.body;
  try{
    const hash = await bcrypt.hash(password||'1234', 10);
    await run('INSERT INTO users(username,password_hash,role,name,phone) VALUES(?,?,?,?,?)',[username,hash,role||'staff',name,phone]);
    req.flash('success','تمت الإضافة');
  }catch(e){ req.flash('error','خطأ: قد يكون اسم المستخدم مكرر'); }
  res.redirect('/users');
});
app.get('/users/:id/edit', requireAdmin, async (req,res)=> {
  const u = await get('SELECT * FROM users WHERE id=?',[req.params.id]);
  if(!u) return res.redirect('/users');
  res.render('users/form', { title:'تعديل مستخدم', userObj:u, action:`/users/${u.id}?_method=PUT`, method:'POST' });
});
app.put('/users/:id', requireAdmin, async (req,res)=>{
  const { username, password, role, name, phone } = req.body;
  const u = await get('SELECT * FROM users WHERE id=?',[req.params.id]);
  if(!u) return res.redirect('/users');
  const hash = password? await bcrypt.hash(password,10) : u.password_hash;
  try{
    await run('UPDATE users SET username=?, password_hash=?, role=?, name=?, phone=? WHERE id=?',[username,hash,role||u.role,name,phone,req.params.id]);
    req.flash('success','تم الحفظ');
  }catch(e){ req.flash('error','خطأ أثناء الحفظ'); }
  res.redirect('/users');
});
app.delete('/users/:id', requireAdmin, async (req,res)=>{ await run('DELETE FROM users WHERE id=?',[req.params.id]); req.flash('success','تم الحذف'); res.redirect('/users'); });

// Settings
app.get('/settings', requireAdmin, async (req,res)=> res.render('settings/index', { title:'الإعدادات', settings: {
  brand_name: await getSetting('brand_name','سونا للتوظيف - العين'),
  vat_rate: await getSetting('vat_rate','5'),
  vat_visible: await getSetting('vat_visible','1'),
  vat_number: await getSetting('vat_number','1000000000')
}}));
app.post('/settings', requireAdmin, async (req,res)=>{
  const { brand_name, vat_rate, vat_visible, vat_number } = req.body;
  await setSetting('brand_name', brand_name);
  await setSetting('vat_rate', vat_rate);
  await setSetting('vat_visible', vat_visible? '1':'0');
  await setSetting('vat_number', vat_number||'');
  req.flash('success','تم تحديث الإعدادات');
  res.redirect('/settings');
});

// Payments
app.get('/payments', requireAuth, async (req,res)=> {
  const payments = await all('SELECT p.*, (SELECT name FROM users u WHERE u.id=p.user_id) user_name FROM payments p ORDER BY p.id DESC LIMIT 200');
  res.render('payments/list', { title:'المدفوعات', payments });
});
app.get('/payments/new', requireAuth, (req,res)=> res.render('payments/form', { title:'إضافة دفعة', action:'/payments', method:'POST', pay: { vat_rate: res.locals.vat_rate } }));
app.post('/payments', requireAuth, async (req,res)=>{
  const { date, method, amount_net, vat_rate, note, contract_type, contract_id } = req.body;
  const net = Number(amount_net||0), rate = Number(vat_rate||res.locals.vat_rate||5);
  const vat = +(net*rate/100).toFixed(2), total = +(net+vat).toFixed(2);
  await run('INSERT INTO payments(date,method,amount_net,vat_rate,amount_vat,amount_total,note,user_id,contract_type,contract_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [date||new Date().toISOString(), method, net, rate, vat, total, note, req.session.user.id, contract_type||null, contract_id||null]);
  req.flash('success','تمت إضافة الدفعة'); res.redirect('/payments');
});

// Reports
app.get('/reports/sales', requireAuth, async (req,res)=>{
  const { from, to, method, user_id } = req.query;
  let where='1=1', p=[];
  if(from){ where+=' AND date(date)>=date(?)'; p.push(from); }
  if(to){ where+=' AND date(date)<=date(?)'; p.push(to); }
  if(method && method!=='all'){ where+=' AND method=?'; p.push(method); }
  if(user_id && user_id!=='all'){ where+=' AND user_id=?'; p.push(user_id); }
  const rows = await all(`SELECT * FROM payments WHERE ${where} ORDER BY date ASC`, p);
  const agg = rows.reduce((a,r)=>{ a.net+=(r.amount_net||0); a.vat+=(r.amount_vat||0); a.total+=(r.amount_total||0); return a; }, {net:0,vat:0,total:0});
  const users = await all('SELECT id, username, name FROM users ORDER BY name');
  res.render('reports/sales', { title:'تقارير المبيعات', rows, agg, users, filters:{from,to,method,user_id} });
});

// Temp contracts
app.get('/contracts/temp', requireAuth, async (req,res)=> res.render('contracts/temp/list', { title:'العقود المؤقتة', rows: await all('SELECT * FROM contracts_temp ORDER BY id DESC LIMIT 200') }));
app.get('/contracts/temp/new', requireAuth, (req,res)=> res.render('contracts/temp/form', { title:'عقد مؤقت جديد', action:'/contracts/temp', method:'POST', obj:{} }));
app.post('/contracts/temp', requireAuth, upload.none(), async (req,res)=>{
  const { party2_employee_name, party2_profession, party2_monthly_salary, party3, terms, signature_data } = req.body;
  let sigPath = null;
  if(signature_data && signature_data.startsWith('data:image/')){
    const b64 = signature_data.split(',')[1]; const buf = Buffer.from(b64,'base64');
    const fname = uuidv4()+'.png'; fs.writeFileSync(path.join(UPLOADS_DIR,fname), buf); sigPath = '/uploads/'+fname;
  }
  await run('INSERT INTO contracts_temp(party1,party2_employee_name,party2_profession,party2_monthly_salary,party3,terms,signature_party1_path,created_by) VALUES(?,?,?,?,?,?,?,?)',
    ['سونا للتوظيف - العين', party2_employee_name, party2_profession, Number(party2_monthly_salary||0), party3, terms, sigPath, req.session.user.id]);
  req.flash('success','تم إنشاء العقد المؤقت'); res.redirect('/contracts/temp');
});
app.get('/contracts/temp/:id/edit', requireAuth, async (req,res)=> {
  const obj = await get('SELECT * FROM contracts_temp WHERE id=?',[req.params.id]);
  if(!obj) return res.redirect('/contracts/temp');
  res.render('contracts/temp/form', { title:'تعديل عقد مؤقت', action:`/contracts/temp/${obj.id}?_method=PUT`, method:'POST', obj });
});
app.put('/contracts/temp/:id', requireAuth, upload.none(), async (req,res)=>{
  const { party2_employee_name, party2_profession, party2_monthly_salary, party3, terms, signature_data } = req.body;
  const old = await get('SELECT * FROM contracts_temp WHERE id=?',[req.params.id]);
  let sigPath = old.signature_party1_path;
  if(signature_data && signature_data.startsWith('data:image/')){
    const b64 = signature_data.split(',')[1]; const buf = Buffer.from(b64,'base64');
    const fname = uuidv4()+'.png'; fs.writeFileSync(path.join(UPLOADS_DIR,fname), buf); sigPath = '/uploads/'+fname;
  }
  await run('UPDATE contracts_temp SET party2_employee_name=?, party2_profession=?, party2_monthly_salary=?, party3=?, terms=?, signature_party1_path=? WHERE id=?',
    [party2_employee_name, party2_profession, Number(party2_monthly_salary||0), party3, terms, sigPath, req.params.id]);
  req.flash('success','تم حفظ التعديلات'); res.redirect('/contracts/temp');
});
app.delete('/contracts/temp/:id', requireAuth, async (req,res)=>{ await run('DELETE FROM contracts_temp WHERE id=?',[req.params.id]); req.flash('success','تم حذف العقد'); res.redirect('/contracts/temp'); });

// Perm contracts
app.get('/contracts/perm', requireAuth, async (req,res)=> res.render('contracts/perm/list', { title:'العقود الدائمة', rows: await all('SELECT * FROM contracts_perm ORDER BY id DESC LIMIT 200') }));
app.get('/contracts/perm/new', requireAuth, (req,res)=> res.render('contracts/perm/form', { title:'عقد دائم جديد', action:'/contracts/perm', method:'POST', obj:{} }));
app.post('/contracts/perm', requireAuth, upload.fields([
  { name:'sponsor_id_file', maxCount:1 }, { name:'sponsor_passport_file', maxCount:1 },
  { name:'employee_passport_file', maxCount:1 }, { name:'employee_id_file', maxCount:1 },
  { name:'sign_sponsor_file', maxCount:1 }, { name:'sign_office_file', maxCount:1 }
]), async (req,res)=>{
  function P(field){ return (req.files && req.files[field] && req.files[field][0]) ? ('/uploads/'+req.files[field][0].filename) : null; }
  const b = req.body;
  await run(`INSERT INTO contracts_perm(party1,sponsor_name,sponsor_phone,sponsor_nationality,sponsor_address,sponsor_id_path,sponsor_passport_path,employee_name,employee_phone,employee_passport_path,employee_id_path,amount,date_from,date_to,has_warranty,warranty_duration,office_terms,sign_sponsor_path,sign_office_path,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['سونا للتوظيف - العين', b.sponsor_name, b.sponsor_phone, b.sponsor_nationality, b.sponsor_address, P('sponsor_id_file'), P('sponsor_passport_file'), b.employee_name, b.employee_phone, P('employee_passport_file'), P('employee_id_file'), Number(b.amount||0), b.date_from, b.date_to, b.has_warranty?1:0, b.warranty_duration, b.office_terms, P('sign_sponsor_file'), P('sign_office_file'), req.session.user.id]);
  req.flash('success','تم إنشاء العقد الدائم'); res.redirect('/contracts/perm');
});
app.get('/contracts/perm/:id/edit', requireAuth, async (req,res)=> {
  const obj = await get('SELECT * FROM contracts_perm WHERE id=?',[req.params.id]);
  if(!obj) return res.redirect('/contracts/perm');
  res.render('contracts/perm/form', { title:'تعديل عقد دائم', action:`/contracts/perm/${obj.id}?_method=PUT`, method:'POST', obj });
});
app.put('/contracts/perm/:id', requireAuth, upload.fields([
  { name:'sponsor_id_file', maxCount:1 }, { name:'sponsor_passport_file', maxCount:1 },
  { name:'employee_passport_file', maxCount:1 }, { name:'employee_id_file', maxCount:1 },
  { name:'sign_sponsor_file', maxCount:1 }, { name:'sign_office_file', maxCount:1 }
]), async (req,res)=>{
  function P(field){ return (req.files && req.files[field] && req.files[field][0]) ? ('/uploads/'+req.files[field][0].filename) : null; }
  const old = await get('SELECT * FROM contracts_perm WHERE id=?',[req.params.id]);
  if(!old) return res.redirect('/contracts/perm');
  const d = req.body;
  await run(`UPDATE contracts_perm SET sponsor_name=?,sponsor_phone=?,sponsor_nationality=?,sponsor_address=?,sponsor_id_path=?,sponsor_passport_path=?,employee_name=?,employee_phone=?,employee_passport_path=?,employee_id_path=?,amount=?,date_from=?,date_to=?,has_warranty=?,warranty_duration=?,office_terms=?,sign_sponsor_path=?,sign_office_path=? WHERE id=?`,
    [d.sponsor_name,d.sponsor_phone,d.sponsor_nationality,d.sponsor_address,P('sponsor_id_file')||old.sponsor_id_path,P('sponsor_passport_file')||old.sponsor_passport_path,d.employee_name,d.employee_phone,P('employee_passport_file')||old.employee_passport_path,P('employee_id_file')||old.employee_id_path,Number(d.amount||0),d.date_from,d.date_to,d.has_warranty?1:0,d.warranty_duration,d.office_terms,P('sign_sponsor_file')||old.sign_sponsor_path,P('sign_office_file')||old.sign_office_path,req.params.id]);
  req.flash('success','تم حفظ التعديلات'); res.redirect('/contracts/perm');
});
app.delete('/contracts/perm/:id', requireAuth, async (req,res)=>{ await run('DELETE FROM contracts_perm WHERE id=?',[req.params.id]); req.flash('success','تم حذف العقد'); res.redirect('/contracts/perm'); });

app.listen(PORT, ()=> console.log('Sona Recruitment (Persistent) http://localhost:'+PORT));
