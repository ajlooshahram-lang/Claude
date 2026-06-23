const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  token?: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: any;
  errors?: Array<{ code: string; message: string }>;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiClient<T>(
  path: string,
  options: ApiOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers = {}, token } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseData = await response.json();

  if (!response.ok) {
    const error = responseData.errors?.[0] ?? { code: 'UNKNOWN', message: 'An error occurred' };
    throw new ApiError(response.status, error.code, error.message);
  }

  return responseData as ApiResponse<T>;
}

// Convenience methods
export const api = {
  get: <T>(path: string, token?: string) =>
    apiClient<T>(path, { method: 'GET', token }),

  post: <T>(path: string, body: any, token?: string) =>
    apiClient<T>(path, { method: 'POST', body, token }),

  patch: <T>(path: string, body: any, token?: string) =>
    apiClient<T>(path, { method: 'PATCH', body, token }),

  delete: <T>(path: string, token?: string) =>
    apiClient<T>(path, { method: 'DELETE', token }),
};
