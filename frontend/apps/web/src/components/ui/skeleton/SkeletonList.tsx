import Skeleton from 'react-loading-skeleton';

interface SkeletonListProps {
  className?: string;
  count?: number;
}

export function SkeletonList({ className = '', count = 1 }: SkeletonListProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <Skeleton key={idx} className={`skeleton-list-item ${className}`} />
      ))}
    </>
  );
}
