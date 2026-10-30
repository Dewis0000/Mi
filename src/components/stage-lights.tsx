export function StageLights() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <div className="absolute -top-40 -left-32 size-[32rem] rounded-full bg-primary/25 blur-[100px]" />
      <div className="absolute top-1/3 -right-40 size-[36rem] rounded-full bg-secondary/25 blur-[110px]" />
      <div className="absolute -bottom-48 left-1/4 size-[30rem] rounded-full bg-gold/20 blur-[100px]" />
      <div className="absolute inset-0 bg-scanlines opacity-40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_75%)]" />
    </div>
  );
}
