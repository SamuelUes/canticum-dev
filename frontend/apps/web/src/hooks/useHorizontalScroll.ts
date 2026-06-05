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
  const frameRef = useRef<number | null>(null);

  const flushFrame = useCallback(() => {
    if (frameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const scheduleUpdate = useCallback((callback: () => void) => {
    if (typeof window === 'undefined') {
      callback();
      return;
    }

    flushFrame();
    frameRef.current = window.requestAnimationFrame(() => {
      callback();
      frameRef.current = null;
    });
  }, [flushFrame]);

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

    scheduleUpdate(updateScrollState);

    const handleTrackScroll = () => scheduleUpdate(updateScrollState);
    const handleWindowResize = () => scheduleUpdate(updateScrollState);

    track.addEventListener('scroll', handleTrackScroll, { passive: true });
    window.addEventListener('resize', handleWindowResize, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      scheduleUpdate(updateScrollState);
    });
    resizeObserver.observe(track);

    const mutationObserver = new MutationObserver(() => {
      scheduleUpdate(updateScrollState);
    });
    mutationObserver.observe(track, { childList: true });

    return () => {
      track.removeEventListener('scroll', handleTrackScroll);
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      flushFrame();
    };
  }, [flushFrame, scheduleUpdate, updateScrollState]);

  return {
    trackRef,
    canScrollPrev,
    canScrollNext,
    scrollPrev,
    scrollNext,
    updateScrollState
  };
}
