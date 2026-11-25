# Rapport d'intégration — API Bibliothèque (Séance 6)

## 1. Flux complet du paiement Stripe
1. L'utilisateur connecté appelle `POST /subscriptions/payment-intent` avec son JWT.
2. Le serveur crée un **PaymentIntent** (500 centimes, EUR) avec les métadonnées `{ user_id, plan: "premium" }`, en utilisant la clé secrète stockée dans `.env`, puis renvoie `client_secret` et `publishable_key`.
3. Le client (Flutter/JS) confirme le paiement **directement auprès de Stripe** avec le `client_secret` : les données de carte ne transitent jamais par notre serveur.
4. Stripe envoie l'événement `payment_intent.succeeded` à `POST /webhooks/stripe`.
5. Le serveur vérifie la signature (`Stripe-Signature` + `STRIPE_WEBHOOK_SECRET`) sur le **corps brut** de la requête (la route est donc montée avant `express.json()`). Signature absente ou invalide → **401**.
6. Il lit `metadata.user_id`, passe `users.subscription_status` à `premium` et répond `200 { received: true }`. Dès lors, le middleware `borrowLimit` n'impose plus la limite de 2 emprunts.

## 2. Pourquoi ne pas appeler OpenAI depuis Flutter ?
Une application mobile peut être décompilée : toute clé embarquée peut être extraite et utilisée à nos frais. En passant par le backend, la clé reste dans `.env`, l'utilisateur est authentifié, les limites sont appliquées, le résumé est mis en cache en base (un seul appel par livre) et on peut changer de fournisseur (OpenAI, Gemini, Groq…) sans publier une nouvelle version de l'application.

## 3. Polling ou Webhook ?
Le polling interroge Stripe à intervalle régulier : latence, requêtes inutiles, risque de dépasser les quotas. Le webhook est poussé par Stripe dès que le paiement est confirmé : immédiat et économe. Dans notre cas le **webhook** est préférable : le serveur reste la source de vérité, la signature HMAC garantit que l'événement vient bien de Stripe, et Stripe retente automatiquement l'envoi en cas d'échec. Une lecture du PaymentIntent peut servir de secours si un événement est perdu.

## 4. Amélioration proposée pour l'intégration OpenAI
- **Rate limiting par utilisateur** (ex. `express-rate-limit`, 10 générations/heure) pour maîtriser les coûts et éviter les abus.
- **Cache** des résultats de smart-search (mots-clés par requête normalisée, TTL 24 h) pour ne pas payer deux fois la même requête.
- **File de jobs asynchrone** pour générer les résumés en arrière-plan sans bloquer la requête HTTP.

## 5. Vérifications effectuées
`npm test` exécute 11 tests d'intégration (OpenAI et Stripe simulés) et le Collection Runner Postman passe à 100 % (28 assertions), y compris lors de relances successives.
