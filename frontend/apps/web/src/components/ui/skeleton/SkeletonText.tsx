import Skeleton from 'react-loading-skeleton';

interface SkeletonTextProps {
  className?: string;
  count?: number;
  width?: number | string;
}

export function SkeletonText({ className = '', count = 1, width }: SkeletonTextProps) {
  return <Skeleton className={`skeleton-text ${className}`} count={count} width={width} />;
}
