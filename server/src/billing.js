'use strict';

/**
 * billing.js — Stripe integration for JulesOps.
 *
 * Handles:
 *   - Creating Stripe Checkout sessions (POST /billing/checkout)
 *   - Handling Stripe webhook events (POST /billing/webhook)
 *   - Billing portal redirect (GET /billing/portal)
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY       — Stripe secret key (sk_test_... or sk_live_...)
 *   STRIPE_WEBHOOK_SECRET   — Stripe webhook signing secret (whsec_...)
 *   STRIPE_PRO_PRICE_ID     — Stripe Price ID for the Pro plan
 *   STRIPE_TEAM_PRICE_ID    — Stripe Price ID for the Team plan
 *   APP_BASE_URL            — Base URL of the app (e.g. https://julesops.example.com)
 *
 * Stripe is lazy-loaded so the server starts without errors if stripe is not installed.
 * Run: npm install stripe  to enable billing.
 */

const crypto = require('crypto');

const db = require('./db');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

const PLAN_PRICE_MAP = {
  pro:  process.env.STRIPE_PRO_PRICE_ID  || '',
  team: process.env.STRIPE_TEAM_PRICE_ID || '',
};

// Read at call-time so tests can set/delete env vars per-test
function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

// ─── Stripe client (lazy) ─────────────────────────────────────────────────────

let _stripe = null;

function getStripe() {
  if (!STRIPE_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  if (!_stripe) {
    let Stripe;
    try {
      Stripe = require('stripe');
    } catch {
      throw new Error(
        'stripe package is not installed. Run: npm install stripe',
      );
    }
    _stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify a Stripe webhook signature.
 *
 * Stripe uses a timestamp + HMAC-SHA256 scheme.
 * See: https://stripe.com/docs/webhooks/signatures
 *
 * @param {Buffer} rawBody
 * @param {string} signatureHeader  Stripe-Signature header value
 * @returns {{ ok: boolean, reason?: string }}
 */
function verifyStripeSignature(rawBody, signatureHeader) {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    return { ok: true, mode: 'disabled' };
  }
  if (!signatureHeader) {
    return { ok: false, reason: 'missing Stripe-Signature header' };
  }

  // Parse t= and v1= from the header
  const parts = {};
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=');
    parts[k.trim()] = v ? v.trim() : '';
  }

  const timestamp = parts['t'];
  const signature = parts['v1'];

  if (!timestamp || !signature) {
    return { ok: false, reason: 'malformed Stripe-Signature header' };
  }

  // Reject if timestamp is more than 5 minutes old
  const ts = Number(timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > 300) {
    return { ok: false, reason: 'webhook timestamp too old (replay attack protection)' };
  }

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return { ok: false, reason: 'invalid Stripe signature' };
  }

  return { ok: true };
}

// ─── Subscription persistence ─────────────────────────────────────────────────

/**
 * Upsert a subscription record from a Stripe event.
 *
 * @param {object} stripeSub  Stripe Subscription object
 * @param {string} plan       'pro' | 'team' | 'free'
 */
async function upsertSubscription(stripeSub, plan) {
  const pool = db.getPool();
  if (!pool) {
    console.log(`[billing] JSON-file mode: skipping subscription DB upsert for ${stripeSub.id}`);
    return;
  }

  // Look up installation by Stripe customer ID
  const installation = await db.queryOne(
    `SELECT id FROM subscriptions WHERE stripe_customer_id = $1`,
    [stripeSub.customer],
  );

  if (!installation) {
    console.warn(`[billing] No installation found for Stripe customer ${stripeSub.customer}`);
    return;
  }

  await db.query(
    `UPDATE subscriptions
        SET stripe_subscription_id = $1,
            plan                   = $2,
            status                 = $3,
            current_period_end     = to_timestamp($4),
            cancel_at_period_end   = $5,
            updated_at             = NOW()
      WHERE stripe_customer_id = $6`,
    [
      stripeSub.id,
      plan,
      stripeSub.status,
      stripeSub.current_period_end,
      stripeSub.cancel_at_period_end,
      stripeSub.customer,
    ],
  );
}

// ─── Plan resolution ──────────────────────────────────────────────────────────

function resolvePlanFromSubscription(subscription) {
  const items = subscription.items && subscription.items.data;
  if (!items || items.length === 0) return 'free';

  const priceId = items[0].price && items[0].price.id;

  if (priceId === PLAN_PRICE_MAP.team) return 'team';
  if (priceId === PLAN_PRICE_MAP.pro) return 'pro';
  return 'free';
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /billing/checkout — Create a Stripe Checkout session and redirect.
 *
 * Expects JSON body: { plan: 'pro' | 'team', installation_id: number }
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 * @param {Buffer}                         rawBody
 */
async function handleCheckout(req, res, rawBody) {
  let body;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
    return;
  }

  const { plan, installation_id } = body;
  const priceId = PLAN_PRICE_MAP[plan];

  if (!priceId) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: `unknown plan: ${plan}. Valid: pro, team` }));
    return;
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_BASE_URL}/billing/cancelled`,
      metadata: { installation_id: String(installation_id || '') },
      allow_promotion_codes: true,
    });

    res.writeHead(302, { location: session.url });
    res.end();
  } catch (err) {
    console.error('[billing] Checkout session error:', err.message);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

/**
 * POST /billing/webhook — Handle Stripe webhook events.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 * @param {Buffer}                         rawBody
 */
async function handleStripeWebhook(req, res, rawBody) {
  const sig = req.headers['stripe-signature'] || '';
  const verification = verifyStripeSignature(rawBody, sig);

  if (!verification.ok) {
    console.warn('[billing] Stripe signature verification failed:', verification.reason);
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: verification.reason }));
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    return;
  }

  console.log(`[billing] Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // If subscription is in the session, immediately update
        if (session.subscription && session.mode === 'subscription') {
          console.log(`[billing] Checkout completed, subscription: ${session.subscription}`);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object;
        const plan = resolvePlanFromSubscription(sub);
        await upsertSubscription(sub, plan);
        console.log(`[billing] Subscription ${sub.id} updated: plan=${plan}, status=${sub.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await upsertSubscription({ ...sub, status: 'cancelled' }, 'free');
        console.log(`[billing] Subscription ${sub.id} deleted — downgraded to free`);
        break;
      }

      default:
        // Unhandled event type — acknowledged but not processed
        break;
    }
  } catch (err) {
    console.error('[billing] Error processing Stripe event:', err.message);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
    return;
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, received: event.type }));
}

/**
 * GET /billing/portal — Redirect to Stripe Customer Portal.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
async function handleBillingPortal(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const customerId = url.searchParams.get('customer_id');

  if (!customerId) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'customer_id query param required' }));
    return;
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
    return;
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_BASE_URL}/dashboard`,
    });
    res.writeHead(302, { location: session.url });
    res.end();
  } catch (err) {
    console.error('[billing] Portal session error:', err.message);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

module.exports = {
  handleCheckout,
  handleStripeWebhook,
  handleBillingPortal,
  verifyStripeSignature,
};
