// Payment cache utility with localStorage
// Persistent cache for episode payments - survives page reloads

const CACHE_PREFIX = 'fap_payment_';

export interface CachedPayment {
  episodeId: string;
  sessionId: string;
  streamToken: string;
  playlistUrl: string;
  grantedSeconds: number;
  paidAt: number; // timestamp
}

function getCacheKey(episodeId: string): string {
  return `${CACHE_PREFIX}${episodeId}`;
}

/**
 * Get cached payment for an episode
 * @param episodeId - The episode ID
 * @returns CachedPayment or null if not found
 */
export function getCachedPayment(episodeId: string): CachedPayment | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getCacheKey(episodeId));
    if (!raw) return null;

    const cached: CachedPayment = JSON.parse(raw);
    return cached;
  } catch (e) {
    // Invalid data or unavailable storage (private mode)
    console.warn('Failed to get cached payment:', e);
    return null;
  }
}

/**
 * Save payment to cache
 * @param episodeId - The episode ID
 * @param payment - Payment data to cache
 */
export function setCachedPayment(
  episodeId: string,
  payment: Omit<CachedPayment, 'episodeId'>
): void {
  if (typeof window === 'undefined') return;

  const cachedPayment: CachedPayment = {
    episodeId,
    ...payment,
  };

  try {
    localStorage.setItem(getCacheKey(episodeId), JSON.stringify(cachedPayment));
  } catch (e) {
    // localStorage may be unavailable (private mode, storage full, etc.)
    console.warn('Failed to cache payment:', e);
  }
}

/**
 * Clear cached payment for an episode
 * @param episodeId - The episode ID
 */
export function clearCachedPayment(episodeId: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(getCacheKey(episodeId));
  } catch (e) {
    console.warn('Failed to clear cached payment:', e);
  }
}

/**
 * Check if episode has cached payment
 * @param episodeId - The episode ID
 * @returns true if episode has been paid for
 */
export function isEpisodePaid(episodeId: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const raw = localStorage.getItem(getCacheKey(episodeId));
    if (!raw) return false;

    // Verify data is valid by parsing
    JSON.parse(raw);
    return true;
  } catch (e) {
    // Invalid data or unavailable storage
    return false;
  }
}

/**
 * Clear all cached payments (useful for logout/reset)
 */
export function clearAllCachedPayments(): void {
  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Failed to clear all cached payments:', e);
  }
}
