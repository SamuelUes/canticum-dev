import type { SubscriptionPlan, UserSubscription, PaymentIntent } from '../../types/subscription';
import { readClientCache, writeClientCache } from '../shared/clientCache';
import { subscriptionPlansMock } from './mockData';
import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';
const SUBSCRIPTION_PLANS_CACHE_KEY = 'canticum:subscription:plans:v1';
const SUBSCRIPTION_PLANS_CACHE_TTL_MS = 1_800_000;

async function getSubscriptionPlansFromFunctions(): Promise<SubscriptionPlan[]> {
  if (!functionsBaseUrl) {
    return [];
  }

  try {
    const headers = await buildFunctionsHeaders({ 'Cache-Control': 'no-store' });

    const response = await fetch(`${functionsBaseUrl}/subscriptions/plans`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return Array.isArray(payload.plans) ? payload.plans : [];
  } catch {
    return [];
  }
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const cached = readClientCache<SubscriptionPlan[]>(SUBSCRIPTION_PLANS_CACHE_KEY);
  if (cached && cached.length > 0) {
    return cached;
  }

  const remotePlans = await getSubscriptionPlansFromFunctions();

  if (remotePlans.length > 0) {
    writeClientCache(SUBSCRIPTION_PLANS_CACHE_KEY, remotePlans, SUBSCRIPTION_PLANS_CACHE_TTL_MS);
    return remotePlans;
  }

  writeClientCache(SUBSCRIPTION_PLANS_CACHE_KEY, subscriptionPlansMock, SUBSCRIPTION_PLANS_CACHE_TTL_MS);
  return subscriptionPlansMock;
}

async function getUserSubscriptionFromFunctions(userId: string): Promise<UserSubscription | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const headers = await buildFunctionsHeaders({ 'Cache-Control': 'no-store' });
    if (!headers.Authorization) {
      return null;
    }

    const response = await fetch(`${functionsBaseUrl}/subscriptions/user/${userId}`, {
      method: 'GET',
      headers: {
        ...headers,
        'Cache-Control': 'no-store'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload.subscription || null;
  } catch {
    return null;
  }
}

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const remoteSubscription = await getUserSubscriptionFromFunctions(userId);

  if (remoteSubscription) {
    return remoteSubscription;
  }

  return null;
}

async function createPaymentIntentFromFunctions(planId: string): Promise<PaymentIntent | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const headers = await buildFunctionsHeaders({ 'Cache-Control': 'no-store' });
    if (!headers.Authorization) {
      return null;
    }

    const response = await fetch(`${functionsBaseUrl}/payments/create-intent`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ planId }),
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload.paymentIntent || null;
  } catch {
    return null;
  }
}

export async function createPaymentIntent(planId: string): Promise<PaymentIntent | null> {
  const remoteIntent = await createPaymentIntentFromFunctions(planId);

  if (remoteIntent) {
    return remoteIntent;
  }

  return null;
}

async function cancelSubscriptionFromFunctions(subscriptionId: string): Promise<boolean> {
  if (!functionsBaseUrl) {
    return false;
  }

  try {
    const headers = await buildFunctionsHeaders({ 'Cache-Control': 'no-store' });
    if (!headers.Authorization) {
      return false;
    }

    const response = await fetch(`${functionsBaseUrl}/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      cache: 'no-store'
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  return await cancelSubscriptionFromFunctions(subscriptionId);
}
