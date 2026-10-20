import { Tooltip } from 'xedonium';

// A grid column title with a drag handle on its right edge. Dragging reports the new width in pixels.
export default function ResizableHeader({ label, onResize }) {
  function startDrag(event) {
    event.preventDefault();
    event.stopPropagation(); // the title is also the sort button; dragging must not sort
    const cell = event.currentTarget.closest('th');
    const startX = event.clientX;
    const startWidth = cell ? cell.getBoundingClientRect().width : 160;
    const move = e => onResize(Math.max(64, Math.round(startWidth + e.clientX - startX)));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }
  function onKeyDown(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const cell = event.currentTarget.closest('th');
    const width = cell ? cell.getBoundingClientRect().width : 160;
    onResize(Math.max(64, Math.round(width + (event.key === 'ArrowRight' ? 16 : -16))));
  }
  return (
    <span className="relative block min-w-0 pr-2">
      <span className="block truncate">{label}</span>
      <Tooltip text="Drag, or use the left and right arrow keys, to resize" placement="top" className="absolute -right-2 -top-1 h-[calc(100%+0.5rem)] w-2">
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize column ${label}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onKeyUp={e => e.stopPropagation()}
          onPointerDown={startDrag}
          onClick={e => e.stopPropagation()}
          className="h-full w-full cursor-col-resize select-none hover:bg-app-soft/60 focus-visible:bg-app-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-strong"
        />
      </Tooltip>
    </span>
  );
}
