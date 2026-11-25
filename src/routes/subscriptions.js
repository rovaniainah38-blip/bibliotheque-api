const router = require('express').Router();
const auth = require('../middleware/auth');
const { getStripe, PRICE_CENTS, CURRENCY } = require('../services/stripe');
const { ok, fail } = require('../utils');

router.post('/payment-intent', auth, async (req, res) => {
  if (req.user.subscription_status === 'premium') return fail(res, 422, 'Vous êtes déjà premium');
  try {
    const pi = await getStripe().paymentIntents.create({
      amount: PRICE_CENTS,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: true },
      metadata: { user_id: String(req.user.id), plan: 'premium' },
    });
    ok(res, { client_secret: pi.client_secret, amount: PRICE_CENTS, currency: CURRENCY, publishable_key: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (e) {
    console.error('[Stripe]', e.message);
    fail(res, 503, 'Service de paiement indisponible');
  }
});

router.get('/status', auth, (req, res) => ok(res, { subscription_status: req.user.subscription_status }));
module.exports = router;
