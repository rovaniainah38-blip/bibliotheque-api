require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

const app = express();

// Le webhook DOIT être monté AVANT express.json() (corps brut requis)
app.use('/api/v1/webhooks', require('./routes/webhooks'));
app.use(express.json());

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/authors', require('./routes/authors'));
app.use('/api/v1/books', require('./routes/books'));
app.use('/api/v1/borrows', require('./routes/borrows'));
app.use('/api/v1/subscriptions', require('./routes/subscriptions'));

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route introuvable' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.status === 400 ? 'JSON invalide' : 'Erreur serveur' });
});
module.exports = app;
