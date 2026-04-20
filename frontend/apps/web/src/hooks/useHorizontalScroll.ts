'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface UseHorizontalScrollResult {
  trackRef: RefObject<HTMLDivElement>;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  scrollPrev: () => void;
  scrollNext: () => void;
  updateScrollState: () => void;
}

export function useHorizontalScroll(step = 320): UseHorizontalScrollResult {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const maxScrollLeft = track.scrollWidth - track.clientWidth;
    setCanScrollPrev(track.scrollLeft > 4);
    setCanScrollNext(track.scrollLeft < maxScrollLeft - 4);
  }, []);

  const scrollByStep = useCallback((direction: 'prev' | 'next') => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const offset = direction === 'next' ? step : -step;
    track.scrollBy({ left: offset, behavior: 'smooth' });
  }, [step]);

  const scrollPrev = useCallback(() => {
    scrollByStep('prev');
  }, [scrollByStep]);

  const scrollNext = useCallback(() => {
    scrollByStep('next');
  }, [scrollByStep]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    updateScrollState();

    track.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      track.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  return {
    trackRef,
    canScrollPrev,
    canScrollNext,
    scrollPrev,
    scrollNext,
    updateScrollState
  };
}
