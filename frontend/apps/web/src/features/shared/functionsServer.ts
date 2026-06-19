import { cookies } from 'next/headers';

export async function getServerSessionToken(): Promise<string | null> {
  try {
    return cookies().get('__session')?.value ?? null;
  } catch {
    return null;
  }
}
