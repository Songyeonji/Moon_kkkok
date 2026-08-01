import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantCls: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-200',
  secondary: 'bg-surface text-slate-700 border border-slate-300 hover:bg-surface-muted focus:ring-slate-200',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-200',
  danger: 'bg-danger-soft text-danger-fg ring-1 ring-inset ring-danger/20 hover:brightness-95 focus:ring-danger/40',
  success: 'bg-success text-white hover:brightness-95 focus:ring-success/40',
};

const sizeCls: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-base',
  lg: 'px-5 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold shadow-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
