export default function Loading() {
  return <div role="status" aria-label="Loading workspace" className="loading-state"><span className="eyebrow">OPENING YOUR WORKSPACE</span><div className="skeleton skeleton-title" /><div className="skeleton skeleton-summary" /><div className="skeleton skeleton-panel" /><span className="sr-only">Loading workspace. Please wait.</span></div>;
}
