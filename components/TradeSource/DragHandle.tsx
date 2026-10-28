'use client';
import { useRef } from 'react';

interface Props {
  kind: 'in' | 'out';
  x: number;
  y: number;
  label: string;
  onDrag: (x: number, y: number, shift: boolean) => void;
  onDragState: (dragging: boolean) => void;
  /** element whose box the pointer coordinates are relative to */
  container: React.RefObject<HTMLDivElement | null>;
  onNudge: (dxCandles: number, dyPx: number) => void;
  testId?: string;
}

/** Draggable IN/OUT marker overlaid on the lightweight-charts canvas (keyboard: arrows move it). */
export default function DragHandle({ kind, x, y, label, onDrag, onDragState, container, onNudge, testId }: Props) {
  const dragging = useRef(false);
  const isIn = kind === 'in';
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      className={`absolute z-20 flex h-7 min-w-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center px-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-on-pill outline outline-2 outline-bg active:cursor-grabbing ${isIn ? 'bg-green' : 'bg-ink'}`}
      style={{ left: x, top: y }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = true;
        onDragState(true);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const box = container.current?.getBoundingClientRect();
        if (!box) return;
        onDrag(e.clientX - box.left, e.clientY - box.top, e.shiftKey);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        onDragState(false);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const map: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] };
        const d = map[e.key];
        if (d) {
          e.preventDefault();
          onNudge(d[0], d[1] * (e.shiftKey ? 5 : 1));
        }
      }}
    >
      {isIn ? 'In' : 'Out'}
    </button>
  );
}
