// Icons from the Figma Make design, unchanged.

export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M7 7.5v12.8c0 2.3 1.9 4.2 4.2 4.2H25"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M13 8v8.2c0 1 .8 1.8 1.8 1.8H25"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 1 .99 1.6 1.83 1.04l8.8-6.2a1.27 1.27 0 0 0 0-2.08l-8.8-6.2A1.25 1.25 0 0 0 8 5.8Z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.5 5.25c0-.7.56-1.25 1.25-1.25h.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25h-.5c-.69 0-1.25-.56-1.25-1.25V5.25Zm6 0c0-.7.56-1.25 1.25-1.25h.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25h-.5c-.69 0-1.25-.56-1.25-1.25V5.25Z" />
    </svg>
  );
}

export function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m6 8 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VolumeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
      <path
        d="M13 7a4 4 0 0 1 0 6M15 4.8a7 7 0 0 1 0 10.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.8 10h14.4M10 2.8c2.2 2.1 3.2 4.5 3.2 7.2s-1 5.1-3.2 7.2M10 2.8C7.8 4.9 6.8 7.3 6.8 10s1 5.1 3.2 7.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Lines of text with a play triangle: read the whole page. */
export function ReadAllIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h8M3 9h6M3 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m12 8.5 5 3-5 3v-6Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
