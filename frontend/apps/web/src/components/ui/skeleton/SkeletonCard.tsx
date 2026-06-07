import Skeleton from 'react-loading-skeleton';

interface SkeletonCardProps {
  className?: string;
  count?: number;
}

export function SkeletonCard({ className = '', count = 1 }: SkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <Skeleton key={idx} className={`skeleton-card ${className}`} />
      ))}
    </>
  );
}
