const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStripe } = require('../services/stripe');
const { fail } = require('../utils');

// IMPORTANT : express.raw() -> la signature se calcule sur le corps BRUT
router.post('/stripe', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return fail(res, 401, 'Signature Stripe absente');

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return fail(res, 401, 'Signature Stripe invalide');
  }

  if (event.type === 'payment_intent.succeeded') {
    const { metadata } = event.data.object;
    if (metadata?.user_id && metadata?.plan === 'premium') {
      db.prepare("UPDATE users SET subscription_status='premium' WHERE id=?").run(metadata.user_id);
    }
  }
  res.status(200).json({ received: true });
});
module.exports = router;
