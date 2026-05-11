import './shared/firebaseAdmin';

export { setUserClaims } from './shared/auth/setUserClaims';
export { onAuthUserCreate } from './shared/auth/onAuthUserCreate';
export { refreshFeaturedSongsWeekly } from './jobs/featuredScheduler';

export * from './web';
export * from './mobile';
