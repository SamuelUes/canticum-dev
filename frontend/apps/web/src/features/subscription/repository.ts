import type { SubscriptionPlan, UserSubscription, PaymentIntent } from '../../types/subscription';
import { readClientCache, writeClientCache } from '../shared/clientCache';

// Import mock data directly to avoid potential cache issues
const subscriptionPlansMock: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Descubre, aprende y confía en la plataforma',
    price: 0,
    currency: 'USD',
    billingPeriod: 'month',
    color: '#133f66',
    backgroundColor: '#F8F5ED',
    features: [
      {
        id: 'catalog-access',
        title: '100% del catálogo',
        description: 'Acceso completo a todas las canciones',
        included: true
      },
      {
        id: 'basic-versions',
        title: '1 versión gratuita por instrumento',
        description: 'Guitarra básica y letra',
        included: true
      },
      {
        id: 'tone-original',
        title: 'Tonalidad original',
        description: 'Sin transposición libre',
        included: true
      },
      {
        id: 'basic-repertoires',
        title: 'Hasta 2 repertorios',
        description: 'Máximo 10 canciones por repertorio',
        included: true
      },
      {
        id: 'limited-favorites',
        title: 'Hasta 10 favoritos',
        description: 'Guarda tus canciones preferidas',
        included: true
      },
      {
        id: 'streaming-audio',
        title: 'Audio de referencia',
        description: 'Solo streaming, sin descarga',
        included: true
      },
      {
        id: 'no-ads',
        title: 'Sin anuncios intrusivos',
        description: 'Experiencia limpia',
        included: true
      },
      {
        id: 'all-instruments',
        title: 'Todos los instrumentos',
        description: 'Piano, batería, pentagrama, orquesta',
        included: false
      },
      {
        id: 'transpose',
        title: 'Transposición libre',
        description: 'Cambia el tono de cualquier canción',
        included: false
      },
      {
        id: 'unlimited-repertoires',
        title: 'repertorios ilimitados',
        description: 'Crea repertorios sin límites',
        included: false
      },
      {
        id: 'offline',
        title: 'Modo offline',
        description: 'Descarga partituras y versiones',
        included: false
      }
    ]
  },
  {
    id: 'premium_monthly',
    name: 'Premium',
    description: 'Prepara, ensaya y sirve en vivo como profesional',
    price: 4.99,
    currency: 'USD',
    billingPeriod: 'month',
    color: '#0b3b5f',
    backgroundColor: '#dcb457',
    isPopular: true,
    features: [
      {
        id: 'catalog-access',
        title: '100% del catálogo',
        description: 'Acceso completo a todas las canciones',
        included: true
      },
      {
        id: 'all-versions',
        title: 'Todas las versiones',
        description: 'Todos los artistas e instrumentos',
        included: true,
        isHighlight: true
      },
      {
        id: 'transpose',
        title: 'Transposición libre',
        description: 'Cambia el tono con vista previa instantánea',
        included: true,
        isHighlight: true
      },
      {
        id: 'unlimited-repertoires',
        title: 'repertorios avanzados',
        description: 'Ilimitados con drag & drop y plantillas',
        included: true,
        isHighlight: true
      },
      {
        id: 'unlimited-favorites',
        title: 'Favoritos ilimitados',
        description: 'Guarda todas tus canciones preferidas',
        included: true
      },
      {
        id: 'offline',
        title: 'Modo offline',
        description: 'Descarga partituras y versiones',
        included: true,
        isHighlight: true
      },
      {
        id: 'no-ads',
        title: 'Sin anuncios',
        description: 'Experiencia premium sin interrupciones',
        included: true
      },
      {
        id: 'future-features',
        title: 'Funciones futuras',
        description: 'Historial, recomendaciones y estadísticas',
        included: true
      }
    ]
  },
  {
    id: 'premium_yearly',
    name: 'Premium Anual',
    description: 'Ahorra 2 meses con el plan anual',
    price: 44.91,
    currency: 'USD',
    billingPeriod: 'year',
    color: '#0b3b5f',
    backgroundColor: '#dcb457',
    features: [
      {
        id: 'catalog-access',
        title: '100% del catálogo',
        description: 'Acceso completo a todas las canciones',
        included: true
      },
      {
        id: 'all-versions',
        title: 'Todas las versiones',
        description: 'Todos los artistas e instrumentos',
        included: true,
        isHighlight: true
      },
      {
        id: 'transpose',
        title: 'Transposición libre',
        description: 'Cambia el tono con vista previa instantánea',
        included: true,
        isHighlight: true
      },
      {
        id: 'unlimited-repertoires',
        title: 'repertorios avanzados',
        description: 'Ilimitados con drag & drop y plantillas',
        included: true,
        isHighlight: true
      },
      {
        id: 'unlimited-favorites',
        title: 'Favoritos ilimitados',
        description: 'Guarda todas tus canciones preferidas',
        included: true
      },
      {
        id: 'offline',
        title: 'Modo offline',
        description: 'Descarga partituras y versiones',
        included: true,
        isHighlight: true
      },
      {
        id: 'no-ads',
        title: 'Sin anuncios',
        description: 'Experiencia premium sin interrupciones',
        included: true
      },
      {
        id: 'savings',
        title: 'Ahorro de 2 meses',
        description: 'Equivalente a $8.33 por mes',
        included: true,
        isHighlight: true
      },
      {
        id: 'future-features',
        title: 'Funciones futuras',
        description: 'Historial, recomendaciones y estadísticas',
        included: true
      }
    ]
  }
];

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');
const SUBSCRIPTION_PLANS_CACHE_KEY = 'canticum:subscription:plans:v1';
const SUBSCRIPTION_PLANS_CACHE_TTL_MS = 1_800_000;

async function getAuthToken(): Promise<string | null> {
  try {
    const { auth } = await import('../../services/firebase');
    if (!auth?.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function getSubscriptionPlansFromFunctions(): Promise<SubscriptionPlan[]> {
  if (!functionsBaseUrl) {
    return [];
  }

  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

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
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetch(`${functionsBaseUrl}/subscriptions/user/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
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
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetch(`${functionsBaseUrl}/payments/create-intent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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
    const token = await getAuthToken();
    if (!token) {
      return false;
    }

    const response = await fetch(`${functionsBaseUrl}/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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
