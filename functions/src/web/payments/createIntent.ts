import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';
import { handlePreflight, sendJson, sendError, getOptionalAuthContext, getBodyRecord } from '../../shared/http/http';

interface CreatePaymentIntentPayload {
  planId: string;
}

export const createIntent = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const authContext = await getOptionalAuthContext(req);
  if (!authContext) {
    sendError(res, 401, 'unauthenticated', 'Authentication required');
    return;
  }

  const body = getBodyRecord(req);
  const { planId } = body as unknown as CreatePaymentIntentPayload;

  if (!planId || typeof planId !== 'string') {
    sendError(res, 400, 'invalid_request', 'Valid planId is required');
    return;
  }

  // Validate plan exists and get price
  const validPlans = {
    'premium_monthly': { price: 4.99, currency: 'USD', name: 'Premium' },
    'premium_yearly': { price: 44.91, currency: 'USD', name: 'Premium Anual' },
    'free': { price: 0, currency: 'USD', name: 'Free' }
  };

  const plan = validPlans[planId as keyof typeof validPlans];
  if (!plan) {
    sendError(res, 400, 'invalid_plan', 'Invalid plan ID');
    return;
  }

  if (plan.price === 0) {
    sendError(res, 400, 'free_plan', 'Free plan does not require payment');
    return;
  }

  try {
    const db = getFirestore();
    const { uid: userId } = authContext;

    // Check if user already has active subscription
    const existingSubsQuery = await db
      .collection('subscriptions')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!existingSubsQuery.empty && existingSubsQuery.docs[0].data().plan === planId) {
      sendError(res, 409, 'already_subscribed', 'User already subscribed to this plan');
      return;
    }

    // Create payment intent record
    const paymentIntentData = {
      userId,
      planId,
      amount: Math.round(plan.price * 100), // Convert to cents
      currency: plan.currency,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const paymentIntentRef = await db.collection('paymentIntents').add(paymentIntentData);
    const paymentIntent = await paymentIntentRef.get();

    // In a real implementation, you would integrate with a payment provider like Stripe
    // For now, we'll create a mock checkout URL
    const checkoutUrl = `https://checkout.canticum.app/payment/${paymentIntent.id}?plan=${planId}&amount=${plan.price}`;

    // Update payment intent with checkout URL
    await paymentIntentRef.update({
      checkoutUrl,
      updatedAt: FieldValue.serverTimestamp()
    });

    sendJson(res, 200, {
      paymentIntent: {
        id: paymentIntent.id,
        userId,
        planId,
        amount: plan.price,
        currency: plan.currency,
        status: 'pending',
        checkoutUrl,
        createdAt: paymentIntentData.createdAt,
        updatedAt: paymentIntentData.updatedAt
      }
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    sendError(res, 500, 'internal_error', 'Failed to create payment intent');
  }
});
