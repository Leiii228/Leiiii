export function DateDivider({ label }: { label: string }) {
  return (
    <div className="pill-line" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}
