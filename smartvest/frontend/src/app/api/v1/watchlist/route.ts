import { NextRequest } from 'next/server';
import { authenticateRequest, formatResponse } from '@/lib/api/middleware';
import { getWatchlist } from '@/lib/api/endpoints';

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if ('error' in auth && auth.error) return auth.error;
  const { userId, rateLimitInfo } = auth as any;
  return formatResponse(getWatchlist(userId), rateLimitInfo);
}
