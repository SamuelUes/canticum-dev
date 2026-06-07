import { Pool, type PoolConfig } from 'pg';

let sharedPool: Pool | null = null;
let isClosingPool = false;

function getRequiredEnv(key: string, fallbackKey?: string): string {
  const value = process.env[key] ?? (fallbackKey ? process.env[fallbackKey] : undefined);
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized) {
    throw new Error(`Missing required Cloud SQL env var: ${key}${fallbackKey ? ` (or ${fallbackKey})` : ''}`);
  }

  return normalized;
}

function getOptionalEnv(key: string, fallbackKey?: string): string | undefined {
  const value = process.env[key] ?? (fallbackKey ? process.env[fallbackKey] : undefined);
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || undefined;
}

function buildPoolConfig(): PoolConfig {
  const database = getRequiredEnv('CLOUD_SQL_DATABASE', 'DB_NAME');
  const user = getRequiredEnv('CLOUD_SQL_USER', 'DB_USER');
  const password = getRequiredEnv('CLOUD_SQL_PASSWORD', 'DB_PASSWORD');

  const host = getOptionalEnv('DB_HOST');
  const portValue = getOptionalEnv('CLOUD_SQL_PORT', 'DB_PORT');
  const port = portValue ? Number(portValue) : 5432;

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Invalid Cloud SQL port. Set CLOUD_SQL_PORT or DB_PORT with a positive number.');
  }

  const baseConfig: PoolConfig = {
    port,
    database,
    user,
    password,
    max: 10,
    min: 1,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,  // Prevent runaway queries
    query_timeout: 30_000,       // Prevent runaway queries
    // allowExitOnIdle: true,
    allowExitOnIdle: false     // Keep pool alive
  };

  if (host) {
    return {
      ...baseConfig,
      host,
      ssl: getOptionalEnv('CLOUD_SQL_SSL', 'DB_SSL') === 'true' ? { rejectUnauthorized: false } : false
    };
  }

  const connectionName = getOptionalEnv('CLOUD_SQL_CONNECTION_STRING', 'CLOUD_SQL_CONNECTION_NAME');
  if (!connectionName) {
    throw new Error('Missing Cloud SQL host. Set DB_HOST or CLOUD_SQL_CONNECTION_STRING/CLOUD_SQL_CONNECTION_NAME.');
  }

  return {
    ...baseConfig,
    host: `/cloudsql/${connectionName}`,
    ssl: false
  };
}

export function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool(buildPoolConfig());
    sharedPool.on('error', async (error) => {
      console.error('[CloudSQL] Pool error; recreating on next use:', error);
      if (isClosingPool || !sharedPool) {
        return;
      }
      const previousPool = sharedPool;
      sharedPool = null;
      isClosingPool = true;
      try {
        await previousPool.end();
      } catch (closeError) {
        console.error('[CloudSQL] Failed to close errored pool:', closeError);
      } finally {
        isClosingPool = false;
      }
    });
  }

  return sharedPool;
}
