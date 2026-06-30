import { NextRequest } from 'next/server';
import { authenticateRequest, formatResponse } from '@/lib/api/middleware';
import { getMarketRegime } from '@/lib/api/endpoints';

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if ('error' in auth && auth.error) return auth.error;
  const { rateLimitInfo } = auth as any;
  return formatResponse(getMarketRegime(), rateLimitInfo);
}
