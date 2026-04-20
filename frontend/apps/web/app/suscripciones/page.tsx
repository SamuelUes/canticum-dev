'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../../src/components/home/Header';
import { HomeFooter } from '../../src/components/home/Footer';
import { SubscriptionPlans } from '../../src/components/suscripciones/SubscriptionPlans';
import { getSubscriptionPlans, createPaymentIntent } from '../../src/features/subscription/repository';
import { useAuth } from '../../src/context/AuthContext';
import { getHomeText } from '../../src/i18n/home';
import type { SubscriptionPlan, UserSubscription } from '../../src/types/subscription';
import type { Locale } from '../../src/types/home';

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const { user } = useAuth();
  const router = useRouter();
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  useEffect(() => {
    async function loadData() {
      try {
        const [subscriptionPlans, subscription] = await Promise.all([
          getSubscriptionPlans(),
          user ? getUserSubscriptionData(user.uid) : null
        ]);
        
        setPlans(subscriptionPlans);
        setUserSubscription(subscription);
      } catch (error) {
        console.error('Error loading subscription data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  async function getUserSubscriptionData(userId: string): Promise<UserSubscription | null> {
    try {
      const { getUserSubscription } = await import('../../src/features/subscription/repository');
      return await getUserSubscription(userId);
    } catch {
      return null;
    }
  }

  async function handlePlanSelect(plan: SubscriptionPlan) {
    if (!user) {
      router.push('/auth');
      return;
    }

    if (plan.price === 0) {
      // Free plan - no payment needed
      router.push('/');
      return;
    }

    if (userSubscription?.plan === plan.id) {
      // Already subscribed to this plan
      return;
    }

    setProcessingPlan(plan.id);

    try {
      const paymentIntent = await createPaymentIntent(plan.id);
      
      if (paymentIntent?.checkoutUrl) {
        // Redirect to payment checkout
        window.location.href = paymentIntent.checkoutUrl;
      } else {
        // Fallback: show payment modal or redirect to payment page
        router.push(`/payment?plan=${plan.id}`);
      }
    } catch (error) {
      console.error('Error creating payment intent:', error);
      // Show error message to user
      alert('Error al procesar el pago. Por favor intenta nuevamente.');

    } finally {
      setProcessingPlan(null);
    }
  }

  if (loading) {
    return (
      <main className="home-page">
        <div className="home-shell">
          <Header text={text} />
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando planes de suscripción...</p>
          </div>
          <HomeFooter
            text={{
              footerKnowTitle: text.footerKnowTitle,
              footerKnowDescription: text.footerKnowDescription,
              footerCopyright: text.footerCopyright
            }}
            sections={[]}
          />
        </div>
        <style jsx>{`
          .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            gap: 1rem;
          }
          
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e5e7eb;
            border-top: 4px solid #133f66;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="home-page">
      <div className="home-shell">
        <Header text={text} />
        
        <div className="subscriptions-hero">
          <h1>Elige tu plan</h1>
          <p>Desbloquea todo el potencial de Canticum con el plan perfecto para ti</p>
        </div>

        <SubscriptionPlans 
          plans={plans}
          onPlanSelect={handlePlanSelect}
          currentPlan={userSubscription?.plan}
          processingPlan={processingPlan}
        />

        <div className="subscriptions-faq">
          <h2>Preguntas frecuentes</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>¿Puedo cancelar en cualquier momento?</h3>
              <p>Sí, puedes cancelar tu suscripción Premium en cualquier momento. Seguirás teniendo acceso hasta el final del período de facturación actual.</p>
            </div>
            <div className="faq-item">
              <h3>¿Qué métodos de pago aceptan?</h3>
              <p>Aceptamos Google Pay y todas las principales tarjetas de crédito y débito.</p>
            </div>
            <div className="faq-item">
              <h3>¿Hay descuentos para grupos?</h3>
              <p>Sí, ofrecemos descuentos especiales para coros, parroquias y estudiantes. Contáctanos para más información.</p>
            </div>
            <div className="faq-item">
              <h3>¿Puedo cambiar de plan?</h3>
              <p>Puedes actualizar o cambiar tu plan en cualquier momento. Los cambios se aplicarán inmediatamente.</p>
            </div>
          </div>
        </div>

        <HomeFooter
          text={{
            footerKnowTitle: text.footerKnowTitle,
            footerKnowDescription: text.footerKnowDescription,
            footerCopyright: text.footerCopyright
          }}
          sections={[]}
        />
      </div>

      <style jsx>{`
        .subscriptions-hero {
          text-align: center;
          padding: 2rem 1rem 2rem;
          max-width: 800px;
          margin: 0 auto;
        }

        .subscriptions-hero h1 {
          font-size: 3rem;
          font-weight: 800;
          color: #133f66;
          margin-bottom: 1rem;
        }

        .subscriptions-hero p {
          font-size: 1.25rem;
          color: #6b7280;
          line-height: 1.6;
        }

        .subscriptions-faq {
          max-width: 1000px;
          margin: 4rem auto 2rem;
          padding: 0 1rem;
        }

        .subscriptions-faq h2 {
          text-align: center;
          font-size: 2rem;
          font-weight: 700;
          color: #133f66;
          margin-bottom: 3rem;
        }

        .faq-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .faq-item {
          padding: 1.5rem;
          border-radius: 12px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
        }

        .faq-item h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #133f66;
          margin-bottom: 0.75rem;
        }

        .faq-item p {
          color: #6b7280;
          line-height: 1.6;
          margin: 0;
        }

        @media (max-width: 768px) {
          .subscriptions-hero {
            padding: 2rem 1rem 1rem;
          }

          .subscriptions-hero h1 {
            font-size: 2rem;
          }

          .subscriptions-hero p {
            font-size: 1rem;
          }

          .faq-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .faq-item {
            padding: 1rem;
          }
        }
      `}</style>
    </main>
  );
}
