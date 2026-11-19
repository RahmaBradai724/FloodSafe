/** Icons of the style D mock-ups (24×24, filled with currentColor). */
const PATHS = {
  drop: "M12 2.5c3.6 4.6 6.5 8.3 6.5 11.6A6.5 6.5 0 0 1 5.5 14.1C5.5 10.8 8.4 7.1 12 2.5Z",
  shield: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 13.6-3.4-3.4 1.4-1.4 2 2 4.6-4.6 1.4 1.4-6 6Z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  route: "M6 3a3 3 0 0 0-1 5.8V15a5 5 0 0 0 5 5h4.2A3 3 0 1 0 14 18h-4a3 3 0 0 1-3-3V8.8A3 3 0 0 0 6 3Zm12 2h-6v2h6a1 1 0 0 1 0 2h-4a3 3 0 0 0 0 6h1v-2h-1a1 1 0 0 1 0-2h4a3 3 0 0 0 0-6Z",
  search: "M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z",
  bell: "M12 3a6 6 0 0 0-6 6v4l-2 3v1h16v-1l-2-3V9a6 6 0 0 0-6-6Zm-2 16a2 2 0 0 0 4 0h-4Z",
  user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5Z",
  back: "M15.5 4 7.5 12l8 8 1.4-1.4L10.3 12l6.6-6.6L15.5 4Z",
  locate: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 3h-2.1A7 7 0 0 0 13 5.1V3h-2v2.1A7 7 0 0 0 5.1 11H3v2h2.1a7 7 0 0 0 5.9 5.9V21h2v-2.1a7 7 0 0 0 5.9-5.9H21v-2Z",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-7 9.3 7 3.9 7-3.9 2 1.1-9 5-9-5 2-1.1Z",
  water: "M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15v2c-2 0-2-1.5-4.5-1.5S14.5 17 12 17s-2.5-1.5-4.5-1.5S5 17 3 17v-2Zm0 4c2 0 2-1.5 4.5-1.5S9.5 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19v2c-2 0-2-1.5-4.5-1.5S14.5 21 12 21s-2.5-1.5-4.5-1.5S5 21 3 21v-2ZM12 3l5 8H7l5-8Z",
  ok: "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7 9.5 16.2Z",
  drain: "M4 5h16v14H4V5Zm2 2v10h12V7H6Zm2 2h2v6H8V9Zm3 0h2v6h-2V9Zm3 0h2v6h-2V9Z",
  flag: "M5 3h2v18H5V3Zm3 1h10l-2 4 2 4H8V4Z",
  pin: "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z",
  close: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  map: "m9 3 6 2 6-2v16l-6 2-6-2-6 2V5l6-2Zm1 2.4v12.2l4 1.3V6.7l-4-1.3Z",
  chart: "M4 19h16v2H4v-2Zm1-3 4-5 4 3 5-7 1.6 1.2-6.2 8.6-4-3-3 3.8L5 16Z",
  play: "M8 5v14l11-7L8 5Z",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
