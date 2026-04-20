import type { HomeData } from '../../types/home';

export const homeMockData: HomeData = {
  featuredSongs: [
    {
      id: 'song-alabare',
      title: 'Alabaré Tu Nombre',
      subtitle: 'Juan Pérez · Versión base',
      isPremium: false
    },
    {
      id: 'song-renuevame',
      title: 'Renuévame Señor',
      subtitle: 'María Luz · Guitarra',
      isPremium: false
    },
    {
      id: 'song-santo-eres-tu',
      title: 'Santo Eres Tú',
      subtitle: 'Coro Emanuel · Piano',
      isPremium: true
    },
    {
      id: 'song-aqui-estoy',
      title: 'Aquí Estoy',
      subtitle: 'Grupo Fiat · Orquesta',
      isPremium: true
    }
  ],
  artists: [
    { id: 'artist-juan-perez', name: 'Juan Pérez' },
    { id: 'artist-maria-luz', name: 'María Luz' },
    { id: 'artist-coro-emanuel', name: 'Coro Emanuel' },
    { id: 'artist-david-reyes', name: 'David Reyes' },
    { id: 'artist-ana-sofia', name: 'Ana Sofía' },
    { id: 'artist-grupo-fiat', name: 'Grupo Fiat' }
  ],
  trends: [
    { id: 'trend-1', title: 'Juan Pérez', subtitle: 'Líder de alabanza' },
    { id: 'trend-2', title: 'María Luz', subtitle: 'Voz principal' },
    { id: 'trend-3', title: 'Coro Emanuel', subtitle: 'Ministerio coral' },
    { id: 'trend-4', title: 'David Reyes', subtitle: 'Director musical' },
    { id: 'trend-5', title: 'Ana Sofía', subtitle: 'Compositora' },
    { id: 'trend-6', title: 'Grupo Fiat', subtitle: 'Ensamble parroquial' }
  ],
  recentSongs: [
    { id: 'recent-1', title: 'Canto de Entrada', subtitle: 'Subida hace 2 días' },
    { id: 'recent-2', title: 'Gloria a Dios', subtitle: 'Subida hace 3 días' },
    { id: 'recent-3', title: 'Ofertorio de Paz', subtitle: 'Subida hace 4 días' },
    { id: 'recent-4', title: 'Santo, Santo', subtitle: 'Subida hace 5 días' },
    { id: 'recent-5', title: 'Cordero de Dios', subtitle: 'Subida hace 6 días' },
    { id: 'recent-6', title: 'Envíanos Señor', subtitle: 'Subida hace 1 semana' }
  ],
  newsletterStats: [
    { id: 'stat-visits', value: '1M+', label: 'Visitas mensuales' },
    { id: 'stat-satisfaction', value: '98%', label: 'Usuarios satisfechos' },
    { id: 'stat-rating', value: '4.9', label: 'Rating promedio' }
  ],
  footerSections: [
    {
      id: 'footer-info',
      title: 'Información',
      links: [
        { id: 'about', label: 'About Us', href: '/' },
        { id: 'career', label: 'Carriler', href: '/' },
        { id: 'blog', label: 'Blog', href: '/' }
      ]
    },
    {
      id: 'footer-news',
      title: 'Novedades',
      links: [
        { id: 'news', label: 'Noticias', href: '/' },
        { id: 'comments', label: 'Comentarios', href: '/' },
        { id: 'support', label: 'Unlimited Support', href: '/' }
      ]
    }
  ]
};
