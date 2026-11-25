const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { ok, fail } = require('../utils');

router.get('/', (req, res) => ok(res, db.prepare('SELECT * FROM authors').all()));
router.get('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM authors WHERE id=?').get(req.params.id);
  return a ? ok(res, a) : fail(res, 404, 'Auteur introuvable');
});
router.post('/', auth, (req, res) => {
  const { first_name, last_name, nationality } = req.body || {};
  if (!first_name || !last_name) return fail(res, 422, 'first_name et last_name requis');
  const id = db.prepare('INSERT INTO authors(first_name,last_name,nationality) VALUES (?,?,?)').run(first_name, last_name, nationality || null).lastInsertRowid;
  ok(res, db.prepare('SELECT * FROM authors WHERE id=?').get(id), {}, 201);
});
module.exports = router;
