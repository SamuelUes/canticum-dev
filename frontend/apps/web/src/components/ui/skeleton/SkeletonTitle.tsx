import Skeleton from 'react-loading-skeleton';

interface SkeletonTitleProps {
  className?: string;
  width?: number | string;
}

export function SkeletonTitle({ className = '', width }: SkeletonTitleProps) {
  return <Skeleton className={`skeleton-title ${className}`} width={width} />;
}
