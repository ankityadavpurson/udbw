import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A tooltip for a menu or popover trigger. The library tooltip would also show for the open menu's own items (a menu is
// a child in the React tree even though it is drawn elsewhere) and sit on top of it. This one only reacts to the trigger
// itself and stays away while a menu is open (a trigger marks that with aria-expanded).
// `align` is where the tip hangs from the trigger: 'start', 'center' or 'end'.
export default function Tip({ text, align = 'center', side = 'bottom', className = '', children }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const [pos, setPos] = useState(null);

  const hide = () => {
    clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const arm = event => {
    hide();
    const box = ref.current;
    if (!box || !box.contains(event.target)) return; // an event from the open menu, which is not inside the trigger
    timer.current = setTimeout(() => {
      if (box.querySelector('[aria-expanded="true"]')) return;
      const r = box.getBoundingClientRect();
      if (side === 'right') setPos({ left: r.right + 8, top: r.top + r.height / 2, transform: 'translateY(-50%)' });
      else
        setPos({
          left: align === 'end' ? r.right : align === 'start' ? r.left : r.left + r.width / 2,
          top: r.bottom + 6,
          transform: align === 'end' ? 'translateX(-100%)' : align === 'center' ? 'translateX(-50%)' : undefined
        });
    }, 450);
  };

  return (
    <span ref={ref} className={`inline-flex ${className}`} onMouseOver={arm} onMouseLeave={hide} onMouseDown={hide} onKeyDown={hide} onBlur={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            aria-hidden="true"
            style={pos}
            className="pointer-events-none fixed z-[100] w-max max-w-[16rem] border border-app-border bg-app-card px-2.5 py-1.5 text-xs normal-case tracking-normal text-app-text shadow-xl"
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
