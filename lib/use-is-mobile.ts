"use client";

import { useEffect, useState } from "react";

// Nothing in the coach app detected viewport width before CoachShell's
// mobile sidebar — this is that same matchMedia pattern, extracted so
// individual pages can adjust their own layout (e.g. Live Group's
// thumbs-below-dots stacking, the athlete page's toolbar dropdown)
// without each re-implementing the listener.
export function useIsMobile(breakpointPx: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpointPx]);

  return isMobile;
}
