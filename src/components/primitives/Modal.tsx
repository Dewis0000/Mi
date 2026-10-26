import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  labelledById?: string;
}

export function Modal({ title, children, onClose }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && onClose) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-card p-6 focus:outline-none"
      >
        <h2 className="mb-4 font-sans text-lg font-semibold text-text">{title}</h2>
        {children}
      </div>
    </div>
  );
}
