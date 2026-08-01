import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  right?: ReactNode;
}

export default function Card({ children, className = '', title, right }: CardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {typeof title === 'string' ? <h2 className="text-base font-bold text-slate-800">{title}</h2> : title}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
