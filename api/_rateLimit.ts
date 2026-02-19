/**
 * Simple in-memory rate limiter for Vercel serverless functions.
 * 
 * Uses a sliding window approach per IP address.
 * Since Vercel serverless functions share memory within the same instance,
 * this provides reasonable protection without external dependencies.
 * 
 * Note: Each cold start resets the counters, so this isn't bulletproof,
 * but it stops casual abuse and runaway scripts.
 */

interface RateWindow {
    count: number;
    resetAt: number;
}

const ipWindows: Map<string, RateWindow> = new Map();

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [ip, window] of ipWindows) {
        if (now > window.resetAt) {
            ipWindows.delete(ip);
        }
    }
}

/**
 * Check if a request should be rate-limited.
 * 
 * @param ip - The client's IP address
 * @param maxRequests - Max requests allowed in the window (default: 30)
 * @param windowMs - Window duration in ms (default: 60 seconds)
 * @returns { allowed: boolean, remaining: number, retryAfterMs: number }
 */
export function checkRateLimit(
    ip: string,
    maxRequests: number = 30,
    windowMs: number = 60_000
): { allowed: boolean; remaining: number; retryAfterMs: number } {
    cleanup();

    const now = Date.now();
    const window = ipWindows.get(ip);

    if (!window || now > window.resetAt) {
        // Start a new window
        ipWindows.set(ip, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
    }

    if (window.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: window.resetAt - now,
        };
    }

    window.count++;
    return { allowed: true, remaining: maxRequests - window.count, retryAfterMs: 0 };
}

/**
 * Extract client IP from Vercel request headers.
 */
export function getClientIp(req: any): string {
    return (
        req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers?.['x-real-ip'] ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

/**
 * Apply rate limiting to a Vercel serverless handler.
 * Returns true if the request was blocked (response already sent).
 * Returns false if the request is allowed to proceed.
 * 
 * Usage:
 *   if (applyRateLimit(req, res)) return;
 */
export function applyRateLimit(
    req: any,
    res: any,
    maxRequests: number = 30,
    windowMs: number = 60_000
): boolean {
    const ip = getClientIp(req);
    const { allowed, remaining, retryAfterMs } = checkRateLimit(ip, maxRequests, windowMs);

    // Always set informational headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));

    if (!allowed) {
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);
        res.setHeader('Retry-After', retryAfterSec);
        res.status(429).json({
            error: 'Too many requests. Please try again shortly.',
            retryAfterSeconds: retryAfterSec,
        });
        return true; // blocked
    }

    return false; // allowed
}
