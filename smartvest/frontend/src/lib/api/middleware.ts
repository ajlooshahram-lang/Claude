/**
 * API Middleware
 *
 * Handles authentication, rate limiting, and response formatting
 * for all public API endpoints.
 *
 * Usage in route handlers:
 *   const { apiKey, rateLimitInfo, userId, error } = authenticateRequest(request);
 *   if (error) return error;
 *   // ... handle request ...
 *   return formatResponse(data, rateLimitInfo);
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, RateLimitInfo } from './types';
import { validateApiKey, recordApiKeyUsage } from './api-keys';
import { checkRateLimit } from './rate-limiter';

export interface AuthResult {
  apiKey: string;
  userId: string;
  tier: 'free' | 'paid';
  rateLimitInfo: RateLimitInfo;
  error?: NextResponse;
}

/**
 * Authenticate an API request using the Authorization header.
 * Expected format: Authorization: Bearer sv_live_xxx_yyy
 */
export function authenticateRequest(
  request: NextRequest
): AuthResult | { error: NextResponse } {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return {
      error: formatError(
        'UNAUTHORIZED',
        'Missing Authorization header. Use: Authorization: Bearer YOUR_API_KEY',
        401,
      ),
    };
  }

  const key = authHeader.replace('Bearer ', '').trim();
  const apiKeyData = validateApiKey(key);

  if (!apiKeyData) {
    return {
      error: formatError(
        'INVALID_KEY',
        'Invalid or inactive API key',
        401,
      ),
    };
  }

  // Check rate limit
  const rateCheck = checkRateLimit(key, apiKeyData.tier);

  if (!rateCheck.allowed) {
    return {
      error: formatError(
        'RATE_LIMITED',
        `Rate limit exceeded. Daily limit: ${rateCheck.info.limit} requests. Resets at ${new Date(rateCheck.info.reset * 1000).toISOString()}`,
        429,
        rateCheck.info,
      ),
    };
  }

  // Record usage
  recordApiKeyUsage(key);

  return {
    apiKey: key,
    userId: apiKeyData.userId,
    tier: apiKeyData.tier,
    rateLimitInfo: rateCheck.info,
  };
}

/**
 * Format a successful API response.
 */
export function formatResponse<T>(
  data: T,
  rateLimitInfo: RateLimitInfo,
  status: number = 200
): NextResponse {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      rateLimit: rateLimitInfo,
    },
  };

  return NextResponse.json(response, {
    status,
    headers: getRateLimitHeaders(rateLimitInfo),
  });
}

/**
 * Format an error API response.
 */
export function formatError(
  code: string,
  message: string,
  status: number,
  rateLimitInfo?: RateLimitInfo,
): NextResponse {
  const response: ApiResponse = {
    success: false,
    error: { code, message },
    meta: {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      rateLimit: rateLimitInfo || { limit: 0, remaining: 0, reset: 0 },
    },
  };

  const headers = rateLimitInfo ? getRateLimitHeaders(rateLimitInfo) : {};
  return NextResponse.json(response, { status, headers });
}

/**
 * Generate rate limit headers.
 */
function getRateLimitHeaders(info: RateLimitInfo): Record<string, string> {
  return {
    'X-RateLimit-Limit': info.limit.toString(),
    'X-RateLimit-Remaining': info.remaining.toString(),
    'X-RateLimit-Reset': info.reset.toString(),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}
