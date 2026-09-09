import type { Metadata } from "next";
import { getOperatingRules, PRIORITIES } from "@/domain/policy";
export const metadata: Metadata = { title: "Operating rules" };

export default function RulesPage() {
  return <>
    <div className="page-heading"><div><h1>Operating rules</h1><p className="page-description">When to follow up, what to verify, and when to involve senior support.</p></div></div>
    <section className="priority-section" aria-labelledby="priority-title"><div className="section-title"><h2 id="priority-title">Contact priority</h2><p>Address the most urgent concern first, then the oldest deadline.</p></div><div className="priority-grid">{PRIORITIES.map((priority) => <article className={`priority-card ${priority.id.toLowerCase()}`} key={priority.id}><h3>{priority.label}</h3><p>{priority.description}</p></article>)}</div></section>
    <section className="rule-list" aria-label="Business rules">{getOperatingRules().map((rule) => <article className="rule-row" key={rule.id} id={rule.id.toLowerCase()}><div className="rule-intro"><h2>{rule.title}</h2><p>{rule.summary}</p></div><ul>{rule.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></article>)}</section>
  </>;
}
