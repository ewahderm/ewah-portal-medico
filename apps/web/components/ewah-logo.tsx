import { cn } from "@/lib/utils";

export function EwahLogo({
  variant = "light",
  className,
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const wordmark = variant === "dark" ? "text-[#0d1825]" : "text-white";
  const sub = variant === "dark" ? "text-[#363f4a]" : "text-white/60";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("text-2xl font-extrabold lowercase leading-none", wordmark)}>
        ewah
      </span>
      <svg
        width="30"
        height="16"
        viewBox="0 0 30 16"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <path
          d="M0 8H8L11 2L15 14L18 8H30"
          stroke="#00C9EC"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={cn("text-xs font-semibold tracking-[0.25em]", sub)}>TECH</span>
    </div>
  );
}
