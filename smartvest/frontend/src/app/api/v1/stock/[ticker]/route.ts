import { NextRequest } from 'next/server';
import { authenticateRequest, formatResponse, formatError } from '@/lib/api/middleware';
import { getStockAnalysis } from '@/lib/api/endpoints';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const auth = authenticateRequest(request);
  if ('error' in auth && auth.error) return auth.error;
  const { rateLimitInfo } = auth as any;
  const { ticker } = await params;
  if (!ticker) {
    return formatError('INVALID_PARAM', 'Ticker symbol is required', 400, rateLimitInfo);
  }
  return formatResponse(getStockAnalysis(ticker), rateLimitInfo);
}
