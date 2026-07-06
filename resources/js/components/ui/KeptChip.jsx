export default function KeptChip() {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full border border-[#BFD6DC] bg-[#EAF3F4] text-kept"
      role="img"
      aria-label="Kept — never expires"
      title="Kept — never expires"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4.5" y="11" width="15" height="9.5" rx="2.2" />
        <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
      </svg>
    </span>
  );
}
