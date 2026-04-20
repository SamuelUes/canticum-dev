export type Locale = 'es';

export interface FeaturedSongCardData {
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  isPremium?: boolean;
}

export interface ArtistData {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ListItemData {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
}

export interface NewsletterStat {
  id: string;
  value: string;
  label: string;
}

export interface FooterLink {
  id: string;
  label: string;
  href: string;
}

export interface FooterSection {
  id: string;
  title: string;
  links: FooterLink[];
}

export interface HomeText {
  brand: string;
  searchPlaceholder: string;
  subscribe: string;
  schemas: string;
  userNameLabel: string;
  welcome: string;
  featuredTitle: string;
  artistsTitle: string;
  trendsTitle: string;
  recentTitle: string;
  viewAll: string;
  newsletterTitle: string;
  newsletterDescription: string;
  learnMore: string;
  footerKnowTitle: string;
  footerKnowDescription: string;
  footerCopyright: string;
}

export interface HomeData {
  featuredSongs: FeaturedSongCardData[];
  artists: ArtistData[];
  trends: ListItemData[];
  recentSongs: ListItemData[];
  newsletterStats: NewsletterStat[];
  footerSections: FooterSection[];
}
