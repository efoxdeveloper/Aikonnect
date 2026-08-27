import { useRef } from "react";
import type { AnimatedIconHandle } from "@/config/navigation";

export function useAnimatedIcon() {
  const ref = useRef<AnimatedIconHandle>(null);
  return {
    ref,
    onMouseEnter: () => ref.current?.startAnimation(),
    onMouseLeave: () => ref.current?.stopAnimation(),
  };
}
