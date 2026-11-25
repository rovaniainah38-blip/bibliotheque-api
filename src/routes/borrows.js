const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const borrowLimit = require('../middleware/borrowLimit');
const { ok, fail } = require('../utils');

router.get('/', auth, (req, res) => ok(res, db.prepare('SELECT * FROM borrows WHERE user_name=?').all(req.user.name)));

// Middleware borrowLimit : max 2 emprunts actifs pour les utilisateurs free
router.post('/', auth, borrowLimit, (req, res) => {
  const { book_id } = req.body || {};
  const book = db.prepare('SELECT * FROM books WHERE id=?').get(book_id);
  if (!book) return fail(res, 404, 'Livre introuvable');
  if (!book.available) return fail(res, 422, 'Livre indisponible');
  db.exec('BEGIN');
  let id;
  try {
    db.prepare('UPDATE books SET available=0 WHERE id=?').run(book_id);
    id = db.prepare('INSERT INTO borrows(user_name,book_id,payment_status) VALUES (?,?,?)').run(req.user.name, book_id, req.paymentStatus).lastInsertRowid;
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  ok(res, db.prepare('SELECT * FROM borrows WHERE id=?').get(id), {}, 201);
});

router.put('/:id/return', auth, (req, res) => {
  const b = db.prepare('SELECT * FROM borrows WHERE id=? AND user_name=?').get(req.params.id, req.user.name);
  if (!b) return fail(res, 404, 'Emprunt introuvable');
  if (b.returned_at) return fail(res, 422, 'Déjà retourné');
  db.prepare("UPDATE borrows SET returned_at=datetime('now') WHERE id=?").run(b.id);
  db.prepare('UPDATE books SET available=1 WHERE id=?').run(b.book_id);
  ok(res, db.prepare('SELECT * FROM borrows WHERE id=?').get(b.id));
});
module.exports = router;