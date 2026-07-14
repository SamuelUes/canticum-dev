import './shared/firebaseAdmin';

export { setUserClaims } from './shared/auth/setUserClaims';
export { bootstrapInitialAdmin } from './shared/auth/setUserClaims';
export { onAuthUserCreate } from './shared/auth/onAuthUserCreate';
export { refreshFeaturedSongsWeekly } from './jobs/featuredSongsScheduler';
export { refreshFeaturedSongsOnDeploy } from './jobs/featuredSongsScheduler';
export { refreshFeaturedArtistsWeekly } from './jobs/featuredArtistsScheduler';
export { refreshFeaturedArtistsOnDeploy } from './jobs/featuredArtistsScheduler';
export { refreshFeaturedAlbumsWeekly } from './jobs/featuredAlbumsScheduler';
export { refreshFeaturedAlbumsOnDeploy } from './jobs/featuredAlbumsScheduler';
export { migrateAlbumStatus } from './jobs/migrateAlbumStatus';

export * from './web';
export * from './mobile';
