'use client';

import { useRef, useState, useCallback, type ReactNode } from 'react';

interface SplitScreenProps {
  left: ReactNode;
  right: ReactNode;
  defaultSplit?: number;
  minLeft?: number;
  minRight?: number;
}

/**
 * Resizable split-screen layout for the editor.
 * Left pane: document preview. Right pane: suggestion wizard.
 */
export function SplitScreen({
  left,
  right,
  defaultSplit = 60,
  minLeft = 30,
  minRight = 25,
}: SplitScreenProps) {
  const [splitPercent, setSplitPercent] = useState(defaultSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(minLeft, Math.min(100 - minRight, percent));
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [minLeft, minRight]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Left pane */}
      <div
        className="h-full overflow-y-auto border-r border-gray-200 bg-white"
        style={{ width: `${splitPercent}%` }}
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center bg-gray-100 transition-colors hover:bg-primary-100"
      >
        <div className="h-8 w-0.5 rounded-full bg-gray-300" />
      </div>

      {/* Right pane */}
      <div
        className="h-full overflow-y-auto bg-gray-50"
        style={{ width: `${100 - splitPercent}%` }}
      >
        {right}
      </div>
    </div>
  );
}
