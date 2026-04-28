import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from './firestore';
import { testCloudSqlConnection } from './cloudSql/users';

let diagnosticsPromise: Promise<void> | null = null;

function logInfo(message: string, payload?: Record<string, unknown>): void {
  functions.logger.info(message, payload ?? {});
  if (payload) {
    console.info(message, payload);
    return;
  }
  console.info(message);
}

function logError(message: string, payload?: Record<string, unknown>): void {
  functions.logger.error(message, payload ?? {});
  if (payload) {
    console.error(message, payload);
    return;
  }
  console.error(message);
}

async function runDiagnosticsOnce(): Promise<void> {
  const firestoreDatabaseId = (process.env.FIRESTORE_DATABASE_ID ?? '(default)').trim() || '(default)';

  try {
    await getAppFirestore().collection('users').limit(1).get();
    logInfo('[startup] Firestore connectivity OK', { firestoreDatabaseId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('[startup] Firestore connectivity FAILED', { firestoreDatabaseId, error: message });
  }

  try {
    await testCloudSqlConnection();
    logInfo('[startup] Cloud SQL connectivity OK');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('[startup] Cloud SQL connectivity FAILED', { error: message });
  }
}

export async function runStartupDiagnostics(): Promise<void> {
  if (!diagnosticsPromise) {
    diagnosticsPromise = runDiagnosticsOnce();
  }

  await diagnosticsPromise;
}
