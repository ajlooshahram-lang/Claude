import { NextRequest } from 'next/server';
import { authenticateRequest, formatResponse, formatError } from '@/lib/api/middleware';
import { executeOrder } from '@/lib/api/endpoints';
import { OrderRequest } from '@/lib/api/types';

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if ('error' in auth && auth.error) return auth.error;
  const { userId, rateLimitInfo } = auth as any;

  let body: OrderRequest;
  try {
    body = await request.json();
  } catch {
    return formatError('INVALID_BODY', 'Request body must be valid JSON', 400, rateLimitInfo);
  }

  // Validate required fields
  if (!body.symbol || !body.side || !body.quantity || !body.type || !body.timeInForce) {
    return formatError('MISSING_FIELDS', 'Required: symbol, side, quantity, type, timeInForce', 400, rateLimitInfo);
  }
  if (!['buy', 'sell'].includes(body.side)) {
    return formatError('INVALID_SIDE', 'Side must be "buy" or "sell"', 400, rateLimitInfo);
  }
  if (body.quantity <= 0) {
    return formatError('INVALID_QUANTITY', 'Quantity must be > 0', 400, rateLimitInfo);
  }

  const result = executeOrder(userId, body);
  return formatResponse(result, rateLimitInfo, 201);
}
