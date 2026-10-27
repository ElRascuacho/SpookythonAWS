import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { reconcileStaleJobs, ReconcilerDependencies } from "./cleanupService";

export interface ScheduledEvent {
  source?: string;
  time?: string;
}

/**
 * Scheduled Reconciler Lambda Handler (EventBridge rate(5 minutes)).
 * Recovers orphaned PENDING/RUNNING jobs older than 15 minutes.
 */
export async function handler(
  event?: ScheduledEvent,
  customDeps?: ReconcilerDependencies,
): Promise<{ statusCode: number; body: string }> {
  const db = customDeps?.db || new InMemoryDatabase();
  const deps: ReconcilerDependencies = {
    db,
    stepFunctionsClient: customDeps?.stepFunctionsClient,
  };

  const result = await reconcileStaleJobs(deps);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      reconciledCount: result.reconciledCount,
      reconciledJobIds: result.reconciledJobIds,
    }),
  };
}
