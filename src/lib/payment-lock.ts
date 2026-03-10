// Payment lock utility with sessionStorage and 30-second TTL
// Prevents duplicate payment attempts for the same episode

const TTL_MS = 30000; // 30 seconds - aligns with backend invoice expiration

interface LockData {
  lockedAt: number;
  episodeId: string;
}

function getLockKey(episodeId: string): string {
  return `payment_lock_${episodeId}`;
}

/**
 * Set a payment lock for an episode with 30-second TTL
 * @param episodeId - The episode ID to lock
 */
export function setPaymentLock(episodeId: string): void {
  if (typeof window === 'undefined') return;
  
  const lockData: LockData = {
    lockedAt: Date.now(),
    episodeId,
  };
  
  try {
    sessionStorage.setItem(getLockKey(episodeId), JSON.stringify(lockData));
  } catch (e) {
    // sessionStorage may be unavailable (private mode, etc.)
    console.warn('Failed to set payment lock:', e);
  }
}

/**
 * Check if a payment is currently locked for an episode
 * @param episodeId - The episode ID to check
 * @returns true if locked and not expired
 */
export function isPaymentLocked(episodeId: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const raw = sessionStorage.getItem(getLockKey(episodeId));
    if (!raw) return false;
    
    const lockData: LockData = JSON.parse(raw);
    const elapsed = Date.now() - lockData.lockedAt;
    
    // Lock expired - auto-clean
    if (elapsed >= TTL_MS) {
      clearPaymentLock(episodeId);
      return false;
    }
    
    return true;
  } catch (e) {
    // Invalid data or unavailable storage
    return false;
  }
}

/**
 * Clear the payment lock for an episode
 * @param episodeId - The episode ID to unlock
 */
export function clearPaymentLock(episodeId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    sessionStorage.removeItem(getLockKey(episodeId));
  } catch (e) {
    console.warn('Failed to clear payment lock:', e);
  }
}

/**
 * Get the remaining lock time in milliseconds
 * @param episodeId - The episode ID to check
 * @returns Remaining time in ms, or 0 if not locked or expired
 */
export function getLockRemainingTime(episodeId: string): number {
  if (typeof window === 'undefined') return 0;
  
  try {
    const raw = sessionStorage.getItem(getLockKey(episodeId));
    if (!raw) return 0;
    
    const lockData: LockData = JSON.parse(raw);
    const elapsed = Date.now() - lockData.lockedAt;
    const remaining = TTL_MS - elapsed;
    
    return Math.max(0, remaining);
  } catch (e) {
    return 0;
  }
}

/**
 * Format remaining lock time for display
 * @param episodeId - The episode ID to check
 * @returns Formatted string like "25s" or null if not locked
 */
export function getLockRemainingText(episodeId: string): string | null {
  const remaining = getLockRemainingTime(episodeId);
  if (remaining <= 0) return null;
  
  const seconds = Math.ceil(remaining / 1000);
  return `${seconds}s`;
}
