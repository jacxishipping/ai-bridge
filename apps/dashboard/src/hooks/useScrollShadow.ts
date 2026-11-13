import { useState, useEffect, type RefObject } from "react";

export function useScrollShadow(ref: RefObject<HTMLDivElement | null>) {
  const [scrollState, setScrollState] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const hasScroll = el.scrollWidth > el.clientWidth;
      setScrollState({
        left: hasScroll && el.scrollLeft > 0,
        right: hasScroll && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);
  return scrollState;
}
