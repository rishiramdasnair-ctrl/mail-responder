interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = "", size = 24 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
      aria-label="ReplyAI logo"
    >
      <path
        d="M118 272
           L372 184
           L236 306
           L286 333
           L418 132
           L220 262
           L216 390
           L248 334"
        stroke="black"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
