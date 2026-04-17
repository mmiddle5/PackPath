// useRoutes.js — API state management hook
// Handles the full route request lifecycle:
//   1. POST /api/routes → get jobId
//   2. Poll GET /api/routes/:jobId every 2s until done/failed
//
// Returns { routes, status, step, message, error, findRoutes, reset }

import { useState, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 3 * 60 * 1000; // 3 minutes

export function useRoutes() {
  const [routes, setRoutes]   = useState(null);
  const [status, setStatus]   = useState('idle'); // idle | loading | done | failed
  const [step, setStep]       = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError]     = useState(null);

  const pollTimer  = useRef(null);
  const startTime  = useRef(null);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const reset = useCallback(() => {
    stopPolling();
    setRoutes(null);
    setStatus('idle');
    setStep(0);
    setMessage('');
    setError(null);
  }, []);

  const pollJob = useCallback((jobId) => {
    const poll = async () => {
      if (Date.now() - startTime.current > MAX_POLL_MS) {
        stopPolling();
        setStatus('failed');
        setError('Route search timed out after 3 minutes. Please try again.');
        return;
      }

      try {
        const res = await fetch(`/api/routes/${jobId}`);
        if (!res.ok) {
          throw new Error(`Server error ${res.status}`);
        }
        const job = await res.json();

        setStep(job.step ?? 0);
        setMessage(job.message ?? '');

        if (job.status === 'done') {
          stopPolling();
          setRoutes(job.routes);
          setStatus('done');
          return;
        }

        if (job.status === 'failed') {
          stopPolling();
          setStatus('failed');
          setError(job.error ?? 'Route search failed. Please try again.');
          return;
        }

        // Still running — poll again
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        stopPolling();
        setStatus('failed');
        setError(`Connection error: ${err.message}`);
      }
    };

    poll();
  }, []);

  const findRoutes = useCallback(async (preferences) => {
    stopPolling();
    setStatus('loading');
    setStep(0);
    setMessage('Starting route search…');
    setError(null);
    setRoutes(null);
    startTime.current = Date.now();

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('failed');
        setError(data.error ?? 'Failed to start route search.');
        return;
      }

      pollJob(data.jobId);
    } catch (err) {
      setStatus('failed');
      setError(`Connection error: ${err.message}`);
    }
  }, [pollJob]);

  return { routes, status, step, message, error, findRoutes, reset };
}
