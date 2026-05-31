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

    track.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });
    resizeObserver.observe(track);
    Array.from(track.children).forEach((child) => resizeObserver.observe(child));

    const mutationObserver = new MutationObserver(() => {
      updateScrollState();
      Array.from(track.children).forEach((child) => resizeObserver.observe(child));
    });
    mutationObserver.observe(track, { childList: true });

    return () => {
      track.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
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
