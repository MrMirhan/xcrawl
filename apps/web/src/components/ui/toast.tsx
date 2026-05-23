'use client';

import * as React from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

type ToastEntry = {
  id: string;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  push: (variant: ToastVariant, message: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<ToastEntry[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const push = React.useCallback<ToastContextValue['push']>((variant, message) => {
    const id = createId();
    setEntries((prev) => [...prev, { id, variant, message }]);
    setTimeout(() => {
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster entries={entries} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return React.useMemo(
    () => ({
      success: (msg: string) => ctx.push('success', msg),
      error: (msg: string) => ctx.push('error', msg),
      info: (msg: string) => ctx.push('info', msg),
    }),
    [ctx],
  );
}

const variantStyles: Record<ToastVariant, { border: string; icon: React.ReactNode }> = {
  success: {
    border: 'border-l-4 border-l-green-500',
    icon: <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" aria-hidden="true" />,
  },
  error: {
    border: 'border-l-4 border-l-destructive',
    icon: <XCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />,
  },
  info: {
    border: 'border-l-4 border-l-blue-500',
    icon: <Info className="h-5 w-5 text-blue-500 shrink-0" aria-hidden="true" />,
  },
};

function Toaster({ entries, onDismiss }: { entries: ToastEntry[]; onDismiss: (id: string) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:max-w-sm"
    >
      {entries.map((entry) => {
        const styles = variantStyles[entry.variant];
        return (
          <div
            key={entry.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-card text-card-foreground shadow-md p-3 pr-2',
              'animate-in slide-in-from-right-2 fade-in duration-200',
              styles.border,
            )}
          >
            {styles.icon}
            <p className="flex-1 text-sm leading-5 break-words">{entry.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(entry.id)}
              aria-label="Dismiss"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
