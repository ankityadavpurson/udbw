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
  return (
    <span className="relative block min-w-0 pr-2">
      <span className="block truncate">{label}</span>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize column ${label}`}
        title="Drag to resize"
        onPointerDown={startDrag}
        onClick={e => e.stopPropagation()}
        className="absolute -right-2 -top-1 h-[calc(100%+0.5rem)] w-2 cursor-col-resize select-none hover:bg-app-soft/60"
      />
    </span>
  );
}
