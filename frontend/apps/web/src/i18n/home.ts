import type { HomeText, Locale } from '../types/home';

const dictionary: Record<Locale, HomeText> = {
  es: {
    brand: '',
    searchPlaceholder: '',
    subscribe: 'Suscribirte',
    repertoires: 'Repertorios',
    userNameLabel: 'Nombre',
    welcome: 'Bienvenido',
    featuredTitle: 'Destacado',
    artistsTitle: 'Tus artistas',
    trendsTitle: 'Tendencias',
    recentTitle: 'Canciones recientes',
    viewAll: 'Ver todo',
    newsletterTitle: 'Suscríbete a nuestro newsletter',
    newsletterDescription: 'Recibe nuevas canciones, versiones y recursos para tus ensayos cada semana.',
    learnMore: 'Conocer más',
    footerKnowTitle: 'Conoce',
    footerKnowDescription: 'Creado para la comunidad musical y catolica. ',
    footerCopyright: 'Hecho con amor por ImpulsaTEC · All Right Reserved'
  }
};

export function getHomeText(locale: Locale = 'es'): HomeText {
  return dictionary[locale];
}
