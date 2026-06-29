'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function BrokerCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setStatus('error');
      setError('No authorization code received. Please try connecting again.');
      return;
    }

    // Exchange code for token
    fetch(`${API_BASE}/api/broker/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Authentication failed');
        return res.json();
      })
      .then(() => {
        setStatus('success');
        // Save connection status
        localStorage.setItem('smartvest_broker_connected', 'true');
        // Redirect to portfolio after 2 seconds
        setTimeout(() => router.replace('/portfolio'), 2000);
      })
      .catch((err) => {
        setStatus('error');
        setError(err.message || 'Could not connect to your broker account.');
      });
  }, [searchParams, router]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="max-w-sm text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)] mx-auto mb-4" />
            <p className="text-sm font-medium">Connecting to your broker...</p>
            <p className="text-xs text-[var(--muted)] mt-1">This only takes a moment</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-[var(--gain)] mx-auto mb-4" />
            <p className="text-sm font-medium text-[var(--gain)]">Broker connected!</p>
            <p className="text-xs text-[var(--muted)] mt-1">Redirecting to your portfolio...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="h-10 w-10 text-[var(--loss)] mx-auto mb-4" />
            <p className="text-sm font-medium text-[var(--loss)]">Connection failed</p>
            <p className="text-xs text-[var(--muted)] mt-2">{error}</p>
            <button
              onClick={() => router.replace('/portfolio')}
              className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white"
            >
              Back to Portfolio
            </button>
          </>
        )}
      </div>
    </div>
  );
}
