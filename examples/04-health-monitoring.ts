/**
 * Example 04 — federated health probes across cooperating circuit breakers.
 *
 * Run: `npx ts-node examples/04-health-monitoring.ts`
 *
 * Why aggregate: readiness endpoints should summarise *systems*, not expose three raw booleans —
 * {@link ResilienceHealth} aligns HTTP `/health/deps` payloads with breaker semantics (`CLOSED`=good).
 */

import { CircuitBreaker } from '../src/core/CircuitBreaker';
import { ConsecutiveFailureBreakingStrategy } from '../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { TimeBasedResetStrategy } from '../src/strategies/reset/TimeBasedResetStrategy';
import { ResilienceHealth } from '../src/health/ResilienceHealth';

async function main(): Promise<void> {
  const paymentService = new CircuitBreaker({
    name: 'paymentService',
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
    resetStrategy: new TimeBasedResetStrategy(30_000),
  });

  const inventoryService = new CircuitBreaker({
    name: 'inventoryService',
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
  });

  const shippingService = new CircuitBreaker({
    name: 'shippingService',
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
  });

  const resilienceHealth = new ResilienceHealth({ name: 'orderPipeline' });

  resilienceHealth.register(paymentService).register(inventoryService).register(shippingService);

  const logTransitions = (): void =>
    resilienceHealth.getAll().forEach((circuit) =>
      console.log(`[telemetry] ${circuit.name} ⇒ ${circuit.state} (healthy=${circuit.healthy})`),
    );

  shippingService.on('open', () => logTransitions());

  console.log('Initial summary ⇢', resilienceHealth.isHealthy());

  // Trip inventory only → expect overall `degraded` (mixture of CLOSED vs OPEN states).
  for (let i = 0; i < 2; i++) {
    await inventoryService.execute(async () => {
      throw new Error('SKU index offline');
    }).catch(() => {
      /* expected */
    });
  }

  const degraded = resilienceHealth.getSummary();
  console.log('After inventory outage snapshot:', JSON.stringify(degraded, null, 2));

  // Torch every breaker ⇒ `critical` summary (all circuits OPEN).
  for (let i = 0; i < 2; i++) {
    await paymentService.execute(async () => {
      throw new Error('psp down');
    }).catch(() => {
      /* expected */
    });
  }

  for (let i = 0; i < 2; i++) {
    await shippingService.execute(async () => {
      throw new Error('carrier webhook failing');
    }).catch(() => {
      /* expected */
    });
  }

  console.log('Critical-era summary ⇢');
  console.log(JSON.stringify(resilienceHealth.getSummary(), null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
