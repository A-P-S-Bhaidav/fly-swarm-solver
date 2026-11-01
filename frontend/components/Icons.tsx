import React from 'react';

interface IconProps {
  className?: string;
}

export function BrandMark({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="4"
        fill="#0B0C0E"
        stroke="#2D6A4F"
        strokeWidth="2.5"
      />
      <path
        d="M23 20C15.5 20 11 25.5 11 32C11 38.5 15.5 44 23 44C26.5 44 29 40.5 30 36V28C29 23.5 26.5 20 23 20Z"
        fill="#1B4332"
        stroke="#52B788"
        strokeWidth="2"
      />
      <path
        d="M41 20C48.5 20 53 25.5 53 32C53 38.5 48.5 44 41 44C37.5 44 35 40.5 34 36V28C35 23.5 37.5 20 41 20Z"
        fill="#1B4332"
        stroke="#52B788"
        strokeWidth="2"
      />
      <path
        d="M20 27L32 32L44 27M20 37L32 32L44 37M32 16V48"
        stroke="#52B788"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="5.5" fill="#DC2626" stroke="#0B0C0E" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="2.2" fill="#FCA5A5" />
    </svg>
  );
}

export function PlayIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4 2.75L13.25 8L4 13.25V2.75Z" />
    </svg>
  );
}

export function StopIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="0.5" />
    </svg>
  );
}

export function LoopIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.5 5.5H4.5C3.4 5.5 2.5 6.4 2.5 7.5V8.5" strokeLinecap="round" />
      <path d="M10.5 3.5L12.75 5.5L10.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 10.5H11.5C12.6 10.5 13.5 9.6 13.5 8.5V7.5" strokeLinecap="round" />
      <path d="M5.5 12.5L3.25 10.5L5.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SlidersIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 4H14M2 8H14M2 12H14" strokeLinecap="round" />
      <rect x="4.5" y="2.5" width="2.5" height="3" fill="#0B0C0E" stroke="currentColor" />
      <rect x="9.5" y="6.5" width="2.5" height="3" fill="#0B0C0E" stroke="currentColor" />
      <rect x="5.5" y="10.5" width="2.5" height="3" fill="#0B0C0E" stroke="currentColor" />
    </svg>
  );
}

export function CloseIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M13.25 8A5.25 5.25 0 1 1 11.7 4.3L13.5 6M13.5 2.75V6H10.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2.25L14.25 13.25H1.75L8 2.25Z" strokeLinejoin="round" />
      <path d="M8 6.5V9.5" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OrbitIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.5" strokeOpacity="0.5" />
      <ellipse cx="8" cy="8" rx="6.5" ry="2.6" transform="rotate(-24 8 8)" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
