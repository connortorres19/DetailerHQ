import type { StaticImageData } from 'next/image';

export type HeroFrame = {
  /** Shot number in the photography brief. */
  shot: string;
  /** Short label shown in the sequence counter. */
  label: string;
  /** What the licensed photograph must show (also used as the placeholder text). */
  subject: string;
  /** Licensed image, once it exists. Without it a marked placeholder is shown. */
  image?: { src: StaticImageData | string; alt: string };
};

// One car, one shoot, consistent light (DESIGN_SYSTEM §7.2, §8.1). No visible badges,
// plates or faces. Add each licensed file under src/assets/hero/ and set `image`.
export const heroFrames: HeroFrame[] = [
  {
    shot: '01',
    label: 'Arrival',
    subject: 'Dark SUV in a dim workshop bay, single soft rim light along the roofline, front three-quarter',
  },
  {
    shot: '02',
    label: 'Inspection',
    subject: 'Same car, inspection light held low across the door, revealing swirls on uncorrected paint',
  },
  {
    shot: '03',
    label: 'Correction',
    subject: 'Same panel after correction, close-up of a clean reflection, microfiber resting on the sill',
  },
  {
    shot: '04',
    label: 'Finished',
    subject: 'Same car finished, front three-quarter, even workshop light, deep gloss with no visible logos',
  },
];
