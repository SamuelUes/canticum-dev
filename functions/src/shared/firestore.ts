import { getFirestore } from 'firebase-admin/firestore';

function getFirestoreDatabaseId(): string | undefined {
  const value = process.env.FIRESTORE_DATABASE_ID ?? 'db-canticum';
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || undefined;
}

export function getAppFirestore() {
  const databaseId = getFirestoreDatabaseId();
  return databaseId ? getFirestore(databaseId) : getFirestore();
}
