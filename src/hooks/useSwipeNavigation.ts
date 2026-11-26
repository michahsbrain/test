import React, {useRef, useState} from 'react';

interface UseSwipeNavigationOptions {
  onPrev: () => void;
  onNext: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
}

export function useSwipeNavigation({
  onPrev,
  onNext,
  scrollContainerRef,
  disabled = false,
}: UseSwipeNavigationOptions) {
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);

  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    axis: 'none' | 'horizontal' | 'vertical';
    atLeftEdge: boolean;
    atRightEdge: boolean;
  } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || e.touches.length !== 1) {
      touchStartRef.current = null;
      setSwipeOffsetX(0);
      return;
    }
    const t = e.touches[0];
    const el = scrollContainerRef?.current;
    const scrollLeft = el ? el.scrollLeft : 0;
    const clientWidth = el ? el.clientWidth : 0;
    const scrollWidth = el ? el.scrollWidth : 0;
    const noHorizontalOverflow = !el || scrollWidth <= clientWidth + 4;

    touchStartRef.current = {
      x: t.clientX,
      y: t.clientY,
      time: Date.now(),
      axis: 'none',
      atLeftEdge: noHorizontalOverflow || scrollLeft <= 4,
      atRightEdge: noHorizontalOverflow || scrollLeft + clientWidth >= scrollWidth - 4,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start || disabled || e.touches.length !== 1) {
      if (swipeOffsetX !== 0) setSwipeOffsetX(0);
      return;
    }

    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (start.axis === 'none') {
      if (Math.hypot(dx, dy) < 10) return;
      start.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'horizontal' : 'vertical';
    }

    if (start.axis === 'horizontal') {
      // Subtle bounded feedback indicating view edges snap to prev/next period
      const canPull = (dx > 0 && start.atLeftEdge) || (dx < 0 && start.atRightEdge);
      if (canPull) {
        const clamped = Math.max(-30, Math.min(30, dx * 0.22));
        setSwipeOffsetX(clamped);
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    setSwipeOffsetX(0);

    if (!start || disabled || e.changedTouches.length !== 1) return;
    if (start.axis === 'vertical') return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.time;

    if (dt > 600) return;
    if (Math.abs(dx) < 48) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.25) return;

    const el = scrollContainerRef?.current;
    const currentScrollLeft = el ? el.scrollLeft : 0;

    if (dx > 0) {
      if (start.atLeftEdge && currentScrollLeft <= 8) {
        onPrev();
      }
    } else {
      const atRightNow =
        !el ||
        el.scrollWidth <= el.clientWidth + 4 ||
        currentScrollLeft + el.clientWidth >= el.scrollWidth - 8;
      if (start.atRightEdge && atRightNow) {
        onNext();
      }
    }
  };

  const onTouchCancel = () => {
    touchStartRef.current = null;
    setSwipeOffsetX(0);
  };

  return {
    swipeOffsetX,
    swipeHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
  };
}
