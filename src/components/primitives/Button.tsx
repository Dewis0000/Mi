import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:brightness-110 disabled:opacity-40',
  secondary: 'border border-border text-text hover:border-accent/60 disabled:opacity-40',
  ghost: 'text-muted hover:text-text underline-offset-4 hover:underline',
  danger: 'border border-down text-down hover:bg-down/10 disabled:opacity-40',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-accent ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
