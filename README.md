# API Bibliothèque v2 — OpenAI · Stripe · Webhooks (Node.js / Express)

Extension du devoir Séance 3 : résumés IA, smart-search, abonnement premium Stripe et webhook signé.

## Lancer le projet
Prérequis : **Node.js ≥ 22.13**
```bash
npm install
cp .env.example .env    
npm start            
```
Swagger UI : http://localhost:3000/api-docs
La base SQLite est créée et migrée automatiquement au démarrage.

## Variables `.env`
`JWT_SECRET` · `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` · `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`
(clés Stripe en mode test uniquement ; aucune clé dans le code)

## Nouveaux endpoints
| Méthode | Route | Auth |
|---|---|---|
| POST | `/api/v1/books/:id/summary` | JWT |
| GET | `/api/v1/books/:id/summary` | — |
| POST | `/api/v1/books/smart-search` | — |
| GET | `/api/v1/books/:id/summary/stream` (bonus SSE) | JWT |
| POST | `/api/v1/subscriptions/payment-intent` | JWT |
| GET | `/api/v1/subscriptions/status` | JWT |
| POST | `/api/v1/webhooks/stripe` | signature Stripe |

## Tests
- `npm test` : tests d'intégration (OpenAI et Stripe simulés).
- Postman : importer `collection_bibliotheque_v2_NomPrenom.json` et `postman_environment.json`, choisir l'environnement, mettre `stripe_webhook_secret` = `STRIPE_WEBHOOK_SECRET` du `.env`, puis lancer le Collection Runner.