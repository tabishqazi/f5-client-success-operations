"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="empty-state panel" role="alert"><p className="eyebrow">WORKSPACE UNAVAILABLE</p><h2>We couldn’t load this view</h2><p>Please try again. A loading failure does not mean there is no work due.</p><button className="button button-primary" onClick={reset}>Try again</button></section>;
}
