export interface SubscriptionPlan {
  id: 'free' | 'premium_monthly' | 'premium_yearly';
  name: string;
  description: string;
  price: number;
  currency: string;
  billingPeriod: 'month' | 'year';
  features: SubscriptionFeature[];
  isPopular?: boolean;
  color: string;
  backgroundColor: string;
}

export interface SubscriptionFeature {
  id: string;
  title: string;
  description: string;
  included: boolean;
  isHighlight?: boolean;
}

export interface UserSubscription {
  id: string;
  userId: string;
  plan: 'free' | 'premium_monthly' | 'premium_yearly';
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  platform: 'web' | 'android' | 'ios';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  id: string;
  userId: string;
  planId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  checkoutUrl?: string;
  clientSecret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPreferences {
  plan: 'free' | 'premium_monthly' | 'premium_yearly';
  autoRenew: boolean;
  paymentMethod: string;
}
