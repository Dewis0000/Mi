import type { HTMLAttributes, ReactNode } from 'react';

export function Card({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded border border-border bg-card p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
