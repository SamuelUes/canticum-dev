import type { SubscriptionPlan } from '../../types/subscription';

export const subscriptionPlansMock: SubscriptionPlan[] = [
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
        id: 'basic-schemas',
        title: 'Hasta 2 esquemas',
        description: 'Máximo 10 canciones por esquema',
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
        id: 'unlimited-schemas',
        title: 'Esquemas ilimitados',
        description: 'Crea esquemas sin límites',
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
        id: 'unlimited-schemas',
        title: 'Esquemas avanzados',
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
        id: 'unlimited-schemas',
        title: 'Esquemas avanzados',
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
