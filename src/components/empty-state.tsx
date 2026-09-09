import Link from "next/link";
import { Icon } from "./icon";

export function EmptyState({ title, description, icon = "people" }: { title: string; description: string; icon?: "people" | "issue" | "today" }) {
  return <section className="empty-state" aria-labelledby="empty-title">
    <div className="empty-symbol"><Icon name={icon} /></div>
    <h2 id="empty-title">{title}</h2>
    <p>{description}</p>
    <Link href="/rules" className="button button-primary">View operating rules<Icon name="arrow" /></Link>
  </section>;
}
