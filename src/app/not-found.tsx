import Link from "next/link";
export default function NotFound() {
  return <section className="empty-state panel"><p className="eyebrow">PAGE NOT FOUND</p><h1>This page isn’t available</h1><p>Return to your daily workspace to continue.</p><Link className="button button-primary" href="/">Back to Today</Link></section>;
}
