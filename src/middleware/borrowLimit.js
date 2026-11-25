const db = require('../db');
const { fail } = require('../utils');
const FREE_LIMIT = 2;

// Bloque POST /borrows si un utilisateur "free" a déjà 2 emprunts actifs
module.exports = function borrowLimit(req, res, next) {
  if (req.user.subscription_status === 'premium') {
    req.paymentStatus = 'paid';
    return next();
  }
  const { c } = db.prepare('SELECT COUNT(*) c FROM borrows WHERE user_name=? AND returned_at IS NULL').get(req.user.name);
  if (c >= FREE_LIMIT) {
    return fail(res, 403, `Limite de ${FREE_LIMIT} emprunts actifs atteinte pour l'abonnement free. Passez en premium.`);
  }
  req.paymentStatus = 'free';
  next();
};
