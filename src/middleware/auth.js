const jwt = require('jsonwebtoken');
const db = require('../db');
const { fail } = require('../utils');

module.exports = function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return fail(res, 401, 'Token manquant');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id,name,email,subscription_status FROM users WHERE id=?').get(payload.id);
    if (!user) return fail(res, 401, 'Utilisateur introuvable');
    req.user = user;
    next();
  } catch {
    return fail(res, 401, 'Token invalide ou expiré');
  }
};
