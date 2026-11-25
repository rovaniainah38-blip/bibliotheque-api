const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const ai = require('../services/ai');
const { ok, fail } = require('../utils');

const BOOK_WITH_AUTHOR = `SELECT b.*, a.first_name, a.last_name FROM books b LEFT JOIN authors a ON a.id=b.author_id`;
const publicBook = (b) => { const { summary_model, summary_generated_at, ...rest } = b; return rest; };

/* ---------- Endpoints existants (Séance 3) ---------- */
router.get('/', (req, res) => ok(res, db.prepare(BOOK_WITH_AUTHOR).all().map(publicBook)));

/* ---------- NOUVEAU : smart-search (avant /:id) ---------- */
router.post('/smart-search', async (req, res) => {
  const query = (req.body?.query || '').trim();
  if (!query) return fail(res, 422, "Le champ 'query' est requis");
  let keywords;
  try {
    keywords = await ai.extractKeywords(query);
  } catch (e) {
    console.error('[OpenAI]', e.message);
    return fail(res, 503, "Service d'IA indisponible, réessayez plus tard");
  }
  const conds = keywords.map(() => '(b.title LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ? OR b.summary LIKE ?)').join(' OR ');
  const params = keywords.flatMap((k) => Array(4).fill(`%${k}%`));
  const data = keywords.length ? db.prepare(`${BOOK_WITH_AUTHOR} WHERE ${conds}`).all(...params).map(publicBook) : [];
  ok(res, data, { query, keywords });
});

router.get('/:id', (req, res) => {
  const b = db.prepare(`${BOOK_WITH_AUTHOR} WHERE b.id=?`).get(req.params.id);
  return b ? ok(res, publicBook(b)) : fail(res, 404, 'Livre introuvable');
});

router.post('/', auth, (req, res) => {
  const { title, isbn, year, author_id } = req.body || {};
  if (!title) return fail(res, 422, 'title requis');
  const id = db.prepare('INSERT INTO books(title,isbn,year,author_id) VALUES (?,?,?,?)').run(title, isbn || null, year || null, author_id || null).lastInsertRowid;
  ok(res, publicBook(db.prepare(`${BOOK_WITH_AUTHOR} WHERE b.id=?`).get(id)), {}, 201);
});

/* ---------- NOUVEAU : résumés OpenAI ---------- */
const summaryPayload = (b) => ({
  book_id: b.id, title: b.title, summary: b.summary,
  generated_by: b.summary_model, generated_at: b.summary_generated_at,
});

router.post('/:id/summary', auth, async (req, res) => {
  const book = db.prepare(`${BOOK_WITH_AUTHOR} WHERE b.id=?`).get(req.params.id);
  if (!book) return fail(res, 404, `Livre #${req.params.id} introuvable`);
  if (book.summary) {
    return ok(res, summaryPayload(book), { message: 'Résumé existant retourné (pas de nouvel appel API)' });
  }
  try {
    const { text, model } = await ai.generateSummary(book);
    const at = new Date().toISOString();
    db.prepare('UPDATE books SET summary=?, summary_model=?, summary_generated_at=? WHERE id=?').run(text, model, at, book.id);
    ok(res, summaryPayload({ ...book, summary: text, summary_model: model, summary_generated_at: at }));
  } catch (e) {
    console.error('[OpenAI]', e.message);
    fail(res, 503, "Service d'IA indisponible, réessayez plus tard");
  }
});

router.get('/:id/summary', (req, res) => {
  const book = db.prepare(`${BOOK_WITH_AUTHOR} WHERE b.id=?`).get(req.params.id);
  if (!book) return fail(res, 404, `Livre #${req.params.id} introuvable`);
  if (!book.summary) return fail(res, 404, "Aucun résumé généré pour ce livre. Utilisez POST /books/{id}/summary");
  ok(res, summaryPayload(book));
});

/* ---------- BONUS : streaming SSE ---------- */
router.get('/:id/summary/stream', auth, async (req, res) => {
  const book = db.prepare(`${BOOK_WITH_AUTHOR} WHERE b.id=?`).get(req.params.id);
  if (!book) return fail(res, 404, `Livre #${req.params.id} introuvable`);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  if (book.summary) {
    res.write(`data: ${JSON.stringify({ token: book.summary })}\n\n`);
    res.write('event: done\ndata: {"cached":true}\n\n');
    return res.end();
  }
  try {
    let full = '';
    for await (const t of ai.streamSummary(book)) {
      full += t;
      res.write(`data: ${JSON.stringify({ token: t })}\n\n`);
    }
    db.prepare('UPDATE books SET summary=?, summary_model=?, summary_generated_at=? WHERE id=?').run(full.trim(), ai.model(), new Date().toISOString(), book.id);
    res.write('event: done\ndata: {"cached":false}\n\n');
  } catch (e) {
    console.error('[OpenAI]', e.message);
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Service d'IA indisponible" })}\n\n`);
  }
  res.end();
});

module.exports = router;
