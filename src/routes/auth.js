const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { ok, fail } = require('../utils');

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return fail(res, 422, 'name, email et password requis');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 422, 'Email déjà utilisé');
  const id = db.prepare('INSERT INTO users(name,email,password) VALUES (?,?,?)').run(name, email, bcrypt.hashSync(password, 10)).lastInsertRowid;
  ok(res, { id, name, email, subscription_status: 'free' }, {}, 201);
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(password || '', u.password)) return fail(res, 401, 'Identifiants invalides');
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  ok(res, { token, user: { id: u.id, name: u.name, email: u.email, subscription_status: u.subscription_status } });
});

module.exports = router;
