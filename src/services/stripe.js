const Stripe = require('stripe');
let stripe;
function getStripe() {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing');
  return stripe;
}
module.exports = { getStripe, PRICE_CENTS: 500, CURRENCY: 'eur' };
