'use client';

import { useRef } from 'react';
import type { PointerEventHandler, ReactNode, WheelEventHandler } from 'react';
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
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    isPointerDownRef.current = true;
    startXRef.current = event.clientX;
    startScrollRef.current = track.scrollLeft;
    track.setPointerCapture(event.pointerId);
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const track = trackRef.current;
    if (!track || !isPointerDownRef.current) {
      return;
    }

    const delta = event.clientX - startXRef.current;
    track.scrollLeft = startScrollRef.current - delta;
  };

  const onPointerEnd: PointerEventHandler<HTMLDivElement> = () => {
    isPointerDownRef.current = false;
  };

  const onWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    track.scrollBy({ left: event.deltaY, behavior: 'auto' });
  };

  return (
    <div className={`horizontal-conveyor ${className ?? ''}`.trim()}>
      <button
        type="button"
        className="conveyor-control"
        onClick={scrollPrev}
        disabled={!canScrollPrev}
        aria-label="Desplazar hacia la izquierda"
      >
        ‹
      </button>

      <div
        ref={trackRef}
        className="conveyor-track"
        role="region"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onWheel={onWheel}
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
        ›
      </button>
    </div>
  );
}
