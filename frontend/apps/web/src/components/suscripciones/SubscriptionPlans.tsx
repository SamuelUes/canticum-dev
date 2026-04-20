'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import type { SubscriptionPlan } from '../../types/subscription';

interface SubscriptionPlansProps {
  plans: SubscriptionPlan[];
  onPlanSelect: (plan: SubscriptionPlan) => void;
  currentPlan?: string;
  processingPlan?: string | null;
}

export function SubscriptionPlans({ plans, onPlanSelect, currentPlan, processingPlan }: SubscriptionPlansProps) {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const [isYearly, setIsYearly] = useState(false);

  const visiblePlans = useMemo(() => {
    const freePlan = plans.find((p) => p.id === 'free');
    const premiumMonthly = plans.find((p) => p.id === 'premium_monthly');
    const premiumYearly = plans.find((p) => p.id === 'premium_yearly');

    const activePremium = isYearly && premiumYearly ? premiumYearly : premiumMonthly;
    const result: SubscriptionPlan[] = [];
    if (freePlan) result.push(freePlan);
    if (activePremium) result.push(activePremium);
    return result;
  }, [plans, isYearly]);

  return (
    <div className="sp-container">
      {/* Billing toggle */}
      <div className="sp-toggle-row">
        <span className={`sp-toggle-label ${!isYearly ? 'sp-toggle-label--active' : ''}`}>Mensual</span>
        <button
          type="button"
          className={`sp-switch ${isYearly ? 'sp-switch--on' : ''}`}
          onClick={() => setIsYearly((prev) => !prev)}
          aria-label="Cambiar facturación mensual o anual"
        >
          <span className="sp-switch-thumb" />
        </button>
        <span className={`sp-toggle-label ${isYearly ? 'sp-toggle-label--active' : ''}`}>Anual</span>
        {isYearly && <span className="sp-save-badge">Ahorra 25%</span>}
      </div>

      {/* Plan cards */}
      <div className="sp-grid">
        {visiblePlans.map((plan) => {
          const isPremium = plan.id !== 'free';
          const isHovered = hoveredPlan === plan.id;
          const otherHovered = hoveredPlan !== null && !isHovered;
          const isCurrentPlan = currentPlan === plan.id;
          const isProcessing = processingPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={`sp-card ${isPremium ? 'sp-card--premium' : 'sp-card--free'} ${isHovered ? 'sp-card--hovered' : ''} ${isCurrentPlan ? 'sp-card--current' : ''}`}
              style={{
                transform: isHovered ? 'scale(1.04)' : otherHovered ? 'scale(0.97)' : 'scale(1)',
              }}
              onMouseEnter={() => setHoveredPlan(plan.id)}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              <h3 className="sp-plan-name">{isPremium ? 'PREMIUN' : 'FREE'}</h3>
              <p className="sp-plan-desc">{plan.description}</p>

              <div className="sp-price-row">
                <span className="sp-price-amount">
                  {plan.price === 0 ? '0' : plan.price.toFixed(2)}
                </span>
                <div className="sp-price-meta">
                  <span className="sp-price-currency">$</span>
                  <span className="sp-price-period">Por Mes</span>
                </div>
              </div>

              <ul className="sp-features">
                {plan.features.map((f) => (
                  <li key={f.id} className="sp-feature">
                    <Image
                      src={
                        f.included
                          ? '/assets/utils/icn-circlecircle-green/icncirclecirclegreen2x.png'
                          : '/assets/utils/icn-circlecircle-xsmute/icncirclecirclexsmute2x.png'
                      }
                      alt={f.included ? 'Incluido' : 'No incluido'}
                      width={22}
                      height={22}
                      className="sp-feature-icon"
                    />
                    <span className={`sp-feature-text ${!f.included ? 'sp-feature-text--muted' : ''}`}>
                      {f.title}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`sp-cta ${isPremium ? 'sp-cta--premium' : 'sp-cta--free'}`}
                onClick={() => onPlanSelect(plan)}
                disabled={isCurrentPlan || isProcessing}
              >
                {isCurrentPlan ? 'Plan Actual' : isProcessing ? 'Procesando...' : 'Try for free'}
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}
