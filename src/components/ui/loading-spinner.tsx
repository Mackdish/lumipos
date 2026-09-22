export default function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid place-items-center">
      <span className="relative block h-16 w-16" aria-hidden="true">
        <span className="loading-orbit absolute inset-0 rounded-full border-[3px] border-primary/20 border-t-primary" />
        <span className="loading-orbit-reverse absolute inset-[9px] rounded-full border-[3px] border-primary/15 border-b-primary/80" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}