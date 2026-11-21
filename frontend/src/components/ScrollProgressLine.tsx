import React, { useEffect, useState } from 'react';

export const ScrollProgressLine: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;

    const measure = () => {
      const mainEl = document.querySelector('main');
      const docEl = document.documentElement;

      const mainMax = mainEl ? Math.max(0, mainEl.scrollHeight - mainEl.clientHeight) : 0;
      const winMax = Math.max(0, docEl.scrollHeight - window.innerHeight);

      let ratio = 0;
      if (mainMax > 1) {
        ratio = (mainEl?.scrollTop || 0) / mainMax;
      } else if (winMax > 1) {
        const scrollTop = window.scrollY || docEl.scrollTop || 0;
        ratio = scrollTop / winMax;
      }

      const clamped = Math.min(1, Math.max(0, ratio));
      setProgress(clamped);
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    measure();

    document.addEventListener('scroll', scheduleMeasure, { capture: true, passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(document.body);
    const mainEl = document.querySelector('main');
    if (mainEl) {
      resizeObserver.observe(mainEl);
      Array.from(mainEl.children).forEach((child) => resizeObserver.observe(child));
    }

    const mutationObserver = new MutationObserver(scheduleMeasure);
    if (mainEl) {
      mutationObserver.observe(mainEl, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('scroll', scheduleMeasure, true);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 inset-x-0 z-[70] h-[3px] pointer-events-none overflow-hidden"
    >
      <div
        className="h-full bg-accent-bg transition-[width] duration-75 ease-out rounded-e-full"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
};
