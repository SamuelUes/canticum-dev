'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { PointerEventHandler, ReactNode } from 'react';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';

interface HorizontalConveyorProps {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  scrollStep?: number;
}

export function HorizontalConveyor({ children, ariaLabel, className, scrollStep = 320 }: HorizontalConveyorProps) {
  const { trackRef, canScrollPrev, canScrollNext, scrollPrev, scrollNext } = useHorizontalScroll(scrollStep);
  const isPointerDownRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    isPointerDownRef.current = true;
    activePointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startScrollRef.current = track.scrollLeft;
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const track = trackRef.current;
    if (!track || !isPointerDownRef.current) {
      return;
    }

    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const delta = event.clientX - startXRef.current;
    if (animationFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    if (typeof window === 'undefined') {
      track.scrollLeft = startScrollRef.current - delta;
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      track.scrollLeft = startScrollRef.current - delta;
      animationFrameRef.current = null;
    });
  };

  const onPointerEnd: PointerEventHandler<HTMLDivElement> = () => {
    isPointerDownRef.current = false;
    activePointerIdRef.current = null;

    if (animationFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const onWheel = useCallback((event: globalThis.WheelEvent) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    track.scrollBy({ left: event.deltaY, behavior: 'auto' });
  }, [trackRef]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    track.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      track.removeEventListener('wheel', onWheel);
    };
  }, [onWheel, trackRef]);

  return (
    <div className={`horizontal-conveyor ${className ?? ''}`.trim()}>
      <button
        type="button"
        className="conveyor-control"
        onClick={scrollPrev}
        disabled={!canScrollPrev}
        aria-label="Desplazar hacia la izquierda"
      >
        {/* ‹ */}
      </button>

      <div
        ref={trackRef}
        className="conveyor-track"
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
      >
        {children}
      </div>

      <button
        type="button"
        className="conveyor-control"
        onClick={scrollNext}
        disabled={!canScrollNext}
        aria-label="Desplazar hacia la derecha"
      >
        {/* › */}
      </button>
    </div>
  );
}
