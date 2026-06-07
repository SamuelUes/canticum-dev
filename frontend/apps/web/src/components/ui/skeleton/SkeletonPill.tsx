import Skeleton from 'react-loading-skeleton';

interface SkeletonPillProps {
  className?: string;
  count?: number;
}

export function SkeletonPill({ className = '', count = 1 }: SkeletonPillProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <Skeleton key={idx} className={`skeleton-pill ${className}`} />
      ))}
    </>
  );
}
