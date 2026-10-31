import Link from 'next/link';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Common = { variant?: Variant; size?: 'md' | 'sm'; icon?: React.ReactNode; children: React.ReactNode; className?: string };

const classes = (variant: Variant, size: 'md' | 'sm', className?: string) =>
  [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');

// DESIGN_SYSTEM §13.1. One primary per view; `danger` is the red-text secondary used outside dialogs.
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  ...rest
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, size, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, children, className, href, target }: Common & { href: string; target?: '_blank' }) {
  return (
    <Link href={href} className={classes(variant, size, className)} target={target} rel={target ? 'noopener' : undefined}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
