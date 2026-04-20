export interface AnalyticsEvent {
  name: string;
  payload: Record<string, unknown>;
}

export async function logAnalyticsEvent(_event: AnalyticsEvent): Promise<void> {
  return;
}
