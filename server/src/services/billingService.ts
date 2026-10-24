/**
 * Billing Service – Stripe Checkout for prepaid analysis credits.
 *
 * Credits are granted only from verified Stripe webhooks (or a verified
 * session lookup), keyed by the Checkout Session id so they're granted once.
 */

import Stripe from 'stripe';
import type {
  CreditCheckoutSession,
  CreditCheckoutStatus,
  CreditPackage,
  CreditPackageId,
  CreditPackageList,
} from '@deal-platform/shared-types';
import { pool } from '../db/pool.js';
import {
  clawbackStripeRefund,
  findCreditLotByCheckoutSession,
  getMeteringConfig,
  grantCredits,
} from './analysisMeteringService.js';

const PACKAGE_DEFINITIONS: Array<Omit<CreditPackage, 'runs'>> = [
  { id: 'credits_6', label: 'Starter', priceCents: 600, creditCents: 600 },
  { id: 'credits_15', label: 'Standard', priceCents: 1500, creditCents: 1500 },
  { id: 'credits_30', label: 'Pro', priceCents: 3000, creditCents: 3000 },
];

export function getCreditPackages(priceCents = getMeteringConfig().priceCents): CreditPackage[] {
  return PACKAGE_DEFINITIONS.map(pkg => ({ ...pkg, runs: Math.floor(pkg.creditCents / priceCents) }));
}

export function findCreditPackage(id: unknown): CreditPackage | undefined {
  return getCreditPackages().find(pkg => pkg.id === id);
}

// ── Stripe client ────────────────────────────────────────────────────────

export class BillingNotConfiguredError extends Error {
  constructor() {
    super('Credit purchases are not available right now.');
  }
}

export class CheckoutNotFoundError extends Error {
  constructor() {
    super('Checkout session not found.');
  }
}

let cachedStripe: { key: string; client: Stripe } | null = null;

export function getStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (cachedStripe?.key !== key) {
    cachedStripe = { key, client: new Stripe(key, { maxNetworkRetries: 2 }) };
  }
  return cachedStripe.client;
}

export function getCreditPackageList(stripe: Stripe | null): CreditPackageList {
  const config = getMeteringConfig();
  return {
    packages: getCreditPackages(config.priceCents),
    pricePerRunCents: config.priceCents,
    creditExpiryMonths: config.creditExpiryMonths,
    purchasesEnabled: Boolean(stripe),
  };
}

function clientUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CLIENT_URL || 'http://localhost:5200').replace(/\/+$/, '');
}

function idOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

// ── Customers & checkout ─────────────────────────────────────────────────

/**
 * Tags every Stripe object this app creates. The Stripe account may be shared
 * with other products, so webhook handling ignores anything without this tag.
 */
export const STRIPE_METADATA_SOURCE = 'asset-dashboard-analysis-credits';

async function getOrCreateCustomer(stripe: Stripe, userId: number): Promise<string> {
  const { rows } = await pool.query<{ email: string; name: string | null; stripe_customer_id: string | null }>(
    'SELECT email, name, stripe_customer_id FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user) throw new CheckoutNotFoundError();
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create(
    {
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      metadata: { userId: String(userId), source: STRIPE_METADATA_SOURCE },
    },
    { idempotencyKey: `deal-platform-customer-${userId}` },
  );
  const updated = await pool.query<{ stripe_customer_id: string }>(
    `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2)
      WHERE id = $1 RETURNING stripe_customer_id`,
    [userId, customer.id],
  );
  return updated.rows[0].stripe_customer_id;
}

export async function createCreditCheckout(
  stripe: Stripe, userId: number, pkg: CreditPackage,
): Promise<CreditCheckoutSession> {
  const customer = await getOrCreateCustomer(stripe, userId);
  const metadata = {
    source: STRIPE_METADATA_SOURCE,
    userId: String(userId),
    packageId: pkg.id,
    creditCents: String(pkg.creditCents),
  };
  const base = `${clientUrl()}/account/billing`;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer,
    client_reference_id: String(userId),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: pkg.priceCents,
        product_data: {
          name: `Property analysis credits – $${(pkg.creditCents / 100).toFixed(0)}`,
          description: `About ${pkg.runs} property analyses. Credits expire ${getMeteringConfig().creditExpiryMonths} months after purchase.`,
        },
      },
    }],
    metadata,
    payment_intent_data: { metadata },
    invoice_creation: { enabled: true },
    success_url: `${base}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?checkout=cancelled`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return { sessionId: session.id, url: session.url };
}

// ── Fulfillment ──────────────────────────────────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/** Grants credits for a paid Checkout Session. Safe to call repeatedly. */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<'credited' | 'pending' | 'ignored'> {
  if (session.mode !== 'payment' || session.metadata?.source !== STRIPE_METADATA_SOURCE) return 'ignored';
  const userId = Number(session.metadata?.userId);
  const pkg = findCreditPackage(session.metadata?.packageId);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !pkg || session.client_reference_id !== String(userId)) {
    console.warn(`[billing:fulfill] ignoring session ${session.id} with unexpected metadata`);
    return 'ignored';
  }
  if (session.payment_status !== 'paid') return 'pending';
  if (await findCreditLotByCheckoutSession(session.id)) return 'credited';

  try {
    await grantCredits(userId, {
      amountCents: pkg.creditCents,
      source: 'purchase',
      description: `Purchased $${(pkg.priceCents / 100).toFixed(2)} credit pack`,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: idOf(session.payment_intent),
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return 'credited';
}

export async function getCheckoutStatus(
  stripe: Stripe | null, userId: number, sessionId: string,
): Promise<CreditCheckoutStatus> {
  const lot = await findCreditLotByCheckoutSession(sessionId);
  if (lot) {
    if (lot.userId !== userId) throw new CheckoutNotFoundError();
    return { status: 'credited', creditCents: lot.amountCents };
  }
  if (!stripe) throw new BillingNotConfiguredError();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) throw new CheckoutNotFoundError();
    throw error;
  }
  if (session.client_reference_id !== String(userId)) throw new CheckoutNotFoundError();

  // Fulfil here too, so a delayed webhook doesn't leave a paid user waiting.
  const result = await fulfillCheckoutSession(session);
  if (result === 'credited') {
    return { status: 'credited', creditCents: findCreditPackage(session.metadata?.packageId)?.creditCents };
  }
  if (session.status === 'expired') return { status: 'expired' };
  if (session.status === 'complete' && session.payment_status === 'unpaid') return { status: 'pending' };
  return { status: session.status === 'open' ? 'pending' : 'failed' };
}

// ── Webhooks ─────────────────────────────────────────────────────────────

async function hasCreditLotForPaymentIntent(paymentIntentId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM credit_lots WHERE stripe_payment_intent_id = $1 LIMIT 1', [paymentIntentId]);
  return (rowCount ?? 0) > 0;
}

export function constructStripeEvent(
  stripe: Stripe, payload: Buffer | string, signature: string, secret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM stripe_events WHERE event_id = $1', [eventId]);
  return (rowCount ?? 0) > 0;
}

async function markProcessed(event: Stripe.Event): Promise<void> {
  await pool.query(
    'INSERT INTO stripe_events (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING',
    [event.id, event.type],
  );
}

/**
 * Applies a verified Stripe event. Handlers are idempotent, and events are
 * recorded only after they succeed so Stripe retries anything that failed.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<'processed' | 'duplicate' | 'ignored'> {
  if (await alreadyProcessed(event.id)) return 'duplicate';

  let outcome: 'processed' | 'ignored' = 'processed';
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const result = await fulfillCheckoutSession(event.data.object);
      if (result === 'ignored') outcome = 'ignored';
      break;
    }
    case 'checkout.session.async_payment_failed':
      if (event.data.object.metadata?.source !== STRIPE_METADATA_SOURCE) outcome = 'ignored';
      else console.warn(`[billing:webhook] async payment failed for session ${event.data.object.id}`);
      break;
    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntentId = idOf(charge.payment_intent);
      const result = paymentIntentId ? await clawbackStripeRefund(paymentIntentId, charge.amount_refunded) : null;
      if (!result) outcome = 'ignored';
      else if (result.clawedBackCents > 0) {
        console.log(`[billing:webhook] clawed back ${result.clawedBackCents}¢ from user ${result.userId}`);
      }
      break;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const paymentIntentId = idOf(dispute.payment_intent);
      if (!paymentIntentId || !await hasCreditLotForPaymentIntent(paymentIntentId)) outcome = 'ignored';
      else console.warn(`[billing:webhook] dispute ${dispute.id} opened for charge ${idOf(dispute.charge)}`);
      break;
    }
    default:
      outcome = 'ignored';
  }

  await markProcessed(event);
  return outcome;
}
