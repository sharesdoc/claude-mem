import { describe, expect, it } from 'bun:test';
import { getSdkSlotOccupancy, waitForSlot } from '../../src/supervisor/process-registry.js';

describe('waitForSlot reservation', () => {
  it('并发申请时不会越过上限，release 后逐个放行', async () => {
    const maxConcurrent = getSdkSlotOccupancy() + 2;
    const first = await waitForSlot(maxConcurrent);
    const second = await waitForSlot(maxConcurrent);
    let thirdGranted = false;
    const thirdPromise = waitForSlot(maxConcurrent).then(reservation => {
      thirdGranted = true;
      return reservation;
    });

    await Bun.sleep(10);
    expect(thirdGranted).toBe(false);
    first.release();
    const third = await thirdPromise;
    expect(thirdGranted).toBe(true);

    // Idempotence must not accidentally free the still-held second slot.
    first.release();
    let fourthGranted = false;
    const fourthPromise = waitForSlot(maxConcurrent).then(reservation => {
      fourthGranted = true;
      return reservation;
    });
    await Bun.sleep(10);
    expect(fourthGranted).toBe(false);

    second.release();
    const fourth = await fourthPromise;
    third.release();
    fourth.release();
  });
});
