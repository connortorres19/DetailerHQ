// Homepage film (DESIGN_SYSTEM §8.1). Assets are built by scripts/encode-film.sh from the
// untouched master in media/source/. Times are in seconds of the encoded film (30 fps).
export const film = {
  sources: {
    1080: '/media/film/film-1080.mp4',
    720: '/media/film/film-720.mp4',
    540: '/media/film/film-540.mp4',
  },
  posters: {
    start: { 960: '/media/film/poster-start-960.jpg', 1600: '/media/film/poster-start-1600.jpg' },
    reveal: { 960: '/media/film/poster-reveal-960.jpg', 1600: '/media/film/poster-reveal-1600.jpg' },
  },
  /** 705 frames at 30 fps. */
  duration: 23.5,
  /** The phone screen covers the frame from here; it is fully black by ~23.1 s. */
  handoff: 22.45,
  /** If the film hasn't produced a frame by then, the page falls back to the static hero. */
  loadTimeoutMs: 15000,
  chapters: [
    { id: '01', label: 'The wash', from: 1.0, to: 6.4 },
    { id: '02', label: 'The finish', from: 6.8, to: 11.8, message: 'The work is yours. The back office shouldn’t be.' },
    { id: '03', label: 'The business behind it', from: 12.6, to: 20.6 },
  ],
  credit: 'Film: AI-generated',
} as const;
