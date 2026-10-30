'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

// Single registration point for the two approved scroll sequences (DESIGN_SYSTEM §8.1).
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  // Mobile browsers resize the viewport as the address bar hides; don't re-measure for that.
  ScrollTrigger.config({ ignoreMobileResize: true });
  // Web fonts swap in after first paint and change section heights.
  void document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

export { gsap, ScrollTrigger, useGSAP };
