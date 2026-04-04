interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = "", size = 24 }: LogoProps) {
  const aspectRatio = 671 / 1000;
  const width = Math.round(size * aspectRatio);

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 671 1000"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ReplyAI logo"
      fill="currentColor"
    >
      <path d="M533.5 297q9.7-1.2 12.5 4.5 3.2 3.3 2 11l-15 38v3l-12 30-6 19-9 21-17 49-40 104-3 11-25 64-2 8-6 15-4.5 5.5-9 1-7-4-72-57-8.5 7v1.5L289.5 652q-2.2-.7-1.5 1.5L246.5 697q-3.3 3.2-11 2l-6.5-5.5-2-11-2-35-1-1v-10l-1-1v-13l-1-1v-12l-1-1v-11l-1-1-1-30-1-1v-11l-1-2.5-7.5-3-5-4-70-39-13-8-4.5-4.5q-2.3-3.2-1-10l3.5-4.5 414-182Z" />
    </svg>
  );
}
