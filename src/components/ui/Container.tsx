import styles from './Container.module.css';

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
};

export function Container({ children, className, narrow = false }: ContainerProps) {
  return (
    <div className={[styles.container, narrow && styles.narrow, className].filter(Boolean).join(' ')}>{children}</div>
  );
}
