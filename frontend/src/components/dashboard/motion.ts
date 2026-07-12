import type { DependencyList, RefObject } from "react";
import { useEffect } from "react";

type Gsap = typeof import("gsap")["gsap"];

let gsapPromise: Promise<Gsap> | null = null;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function loadGsap() {
  gsapPromise ??= import("gsap").then((module) => module.gsap);
  return gsapPromise;
}

export function runGsapAnimation(animation: (gsap: Gsap) => void) {
  void loadGsap().then(animation);
}

export function useScopedGsapAnimation<T extends HTMLElement>(
  rootRef: RefObject<T | null>,
  enabled: boolean,
  animation: (gsap: Gsap, root: T) => void,
  dependencies: DependencyList
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || prefersReducedMotion()) return;

    let cancelled = false;
    let context: { revert: () => void } | undefined;
    void loadGsap().then((gsap) => {
      if (cancelled) return;
      context = gsap.context(() => animation(gsap, root), root);
    });

    return () => {
      cancelled = true;
      context?.revert();
    };
    // The caller provides the exact primitive dependencies for the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
