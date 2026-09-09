"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { compareDates, dateInTimeZone } from "@/domain/clock";
import type { QueueCard } from "@/domain/evaluate";
import type { Priority } from "@/domain/types";
import { ContactOutcomeForm } from "./contact-outcome-form";
import { DataState } from "./data-state";
import { api, displayDate, ensureWorkspace } from "./workspace-data";

type QueueResponse = {
  asOf: string;
  scope: "today" | "upcoming";
  hasPlacements: boolean;
  counts: { immediate: number; urgent: number; overdue: number; dueToday: number };
  cards: QueueCard[];
};
type QueueFilter = "all" | "immediate" | "urgent" | "overdue" | "dueToday";

const labels: Record<Priority, string> = { P0: "Immediate", P1: "Urgent", P2: "Follow up", P3: "Routine" };
const sections = [["now", "Contact now"], ["later", "Later today"], ["upcoming", "Next contact window"]] as const;
const filterLabels: Record<Exclude<QueueFilter, "all">, string> = {
  immediate: "Immediate",
  urgent: "Urgent",
  overdue: "Overdue",
  dueToday: "Due today",
};

function prioritizedSections(cards: QueueCard[]) {
  return [...sections].sort(([left], [right]) => cards.findIndex((card) => card.bucket === left) - cards.findIndex((card) => card.bucket === right));
}

function nextAction(card: QueueCard) {
  const types = new Set(card.reasons.map((reason) => reason.type));
  if (types.has("senior_review")) return "Confirm senior ownership and the decision needed.";
  if (types.has("issue_triage")) return "Clarify the impact and agree the immediate recovery step.";
  if (types.has("corrective_action")) return "Confirm the corrective action, owner and revised completion time.";
  if (types.has("verification")) return "Confirm whether the agreed fix held through this observation window.";
  if (types.has("client_feedback")) return "Collect placement-specific client feedback and confirm satisfaction.";
  if (types.has("client_monthly")) return "Complete the monthly client relationship check-in.";
  if (types.has("professional_monthly")) return "Complete the professional’s monthly one-to-one.";
  return "Confirm the trial decision before the deadline.";
}

function matchesFilter(card: QueueCard, filter: QueueFilter, asOf: string) {
  if (filter === "all") return true;
  if (filter === "immediate") return card.priority === "P0";
  if (filter === "urgent") return card.priority === "P1";
  return card.reasons.some((reason) => {
    const dueDate = dateInTimeZone(reason.dueAt);
    return filter === "overdue" ? compareDates(dueDate, asOf) < 0 : compareDates(dueDate, asOf) === 0;
  });
}

function trialFact(trialEnd: string, asOf: string) {
  return compareDates(trialEnd, asOf) < 0
    ? `Trial ended on ${displayDate(trialEnd)}`
    : `Trial ends ${displayDate(trialEnd)}`;
}

function QueueCardView({ card, asOf, expanded, onOpen, onSaved, onCancel }: {
  card: QueueCard;
  asOf: string;
  expanded: boolean;
  onOpen: () => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  return <article className={`queue-card priority-${card.priority.toLowerCase()}`}>
    <div className="queue-card-top">
      <div>
        <span className="priority-label">{labels[card.priority]}</span>
        <h3>{card.contactName}</h3>
        <p>{card.contactSide === "senior" ? "Senior Operations Lead" : card.contactSide === "client" ? card.clientName : `${card.professionalNames.join(", ")} · ${card.clientName ?? "Placement"}`}</p>
        {card.contactSide === "client" && card.professionalNames.length > 0 && <p className="affected-placements">Placements: {card.professionalNames.join(", ")}</p>}
      </div>
      <div className="local-time"><strong>{card.localTime}</strong><span>{card.contactZone.replace("_", " ")}</span></div>
    </div>
    <ul className="reason-list">{card.reasons.map((reason) => <li key={reason.obligationId}>{reason.text}</li>)}</ul>
    <p className="next-action"><strong>Next:</strong> {nextAction(card)}</p>
    {card.trialEnd && <p className="queue-fact">{trialFact(card.trialEnd, asOf)}</p>}
    <div className="queue-card-foot">
      <div><span>{card.nextContactAt ? "Next contact" : "Oldest deadline"}</span><strong>{displayDate(card.nextContactAt ?? card.oldestDueAt)}</strong></div>
      <div className="queue-actions">
        <button className="button button-primary" type="button" onClick={onOpen}>{expanded ? "Outcome form open" : "Record outcome"}</button>
        {card.clientId && <Link className="text-link" href={`/clients/${card.clientId}`}>View client</Link>}
        {card.placementId && <Link className="text-link" href={`/placements/${card.placementId}`}>Review placement</Link>}
      </div>
    </div>
    {expanded && <ContactOutcomeForm card={card} asOf={asOf} onCancel={onCancel} onSaved={onSaved} />}
  </article>;
}

export function TodayWorkspace() {
  const [scope, setScope] = useState<"today" | "upcoming">("today");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [state, setState] = useState<{ data?: QueueResponse; error: string }>({ error: "" });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const reload = useCallback(() => { setLoading(true); setRevision((value) => value + 1); }, []);

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        await ensureWorkspace();
        const data = await api<QueueResponse>(`/api/queue?scope=${scope}`, { method: "POST" });
        if (!canceled) setState({ data, error: "" });
      } catch (error) {
        if (!canceled) setState((previous) => ({ data: previous.data, error: error instanceof Error ? error.message : "Unable to load today’s work." }));
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    const focus = () => reload();
    window.addEventListener("focus", focus);
    const timer = window.setInterval(reload, 300000);
    return () => { canceled = true; window.removeEventListener("focus", focus); window.clearInterval(timer); };
  }, [scope, revision, reload]);

  const data = state.data?.scope === scope ? state.data : undefined;
  const displayedCards = data ? data.cards.filter((card) => matchesFilter(card, filter, data.asOf)) : [];
  const selectScope = (nextScope: "today" | "upcoming") => {
    setLoading(true);
    setActiveCard(null);
    setFilter("all");
    setScope(nextScope);
  };
  const selectFilter = (nextFilter: Exclude<QueueFilter, "all">) => {
    setActiveCard(null);
    if (scope !== "today") {
      setLoading(true);
      setScope("today");
      setFilter(nextFilter);
      return;
    }
    setFilter((current) => current === nextFilter ? "all" : nextFilter);
  };
  const cardProps = (card: QueueCard) => ({
    card,
    asOf: data!.asOf,
    expanded: activeCard === card.id,
    onOpen: () => { setSaved(""); setActiveCard(card.id); },
    onCancel: () => setActiveCard(null),
    onSaved: () => { setActiveCard(null); setSaved(`Outcome saved for ${card.contactName}.`); reload(); },
  });
  const metrics: { key: Exclude<QueueFilter, "all">; count: number }[] = data ? [
    { key: "immediate", count: data.counts.immediate },
    { key: "urgent", count: data.counts.urgent },
    { key: "overdue", count: data.counts.overdue },
    { key: "dueToday", count: data.counts.dueToday },
  ] : [];

  return <>
    <div className="queue-tabs" role="group" aria-label="Work horizon">
      <button className={scope === "today" ? "active" : ""} aria-pressed={scope === "today"} onClick={() => selectScope("today")}>Today</button>
      <button className={scope === "upcoming" ? "active" : ""} aria-pressed={scope === "upcoming"} onClick={() => selectScope("upcoming")}>Upcoming</button>
    </div>
    {saved && <p className="save-success" role="status">{saved}</p>}
    <DataState error={state.error} loading={loading && !data} retry={reload} kind="queue" />
    {data && <>
      <div className="summary-strip queue-summary" aria-label="Daily work summary">
        {metrics.map(({ key, count }) => <button
          type="button"
          className={`summary-metric ${filter === key ? "active" : ""}`}
          aria-pressed={filter === key}
          aria-label={`${filterLabels[key]}: ${count} contact${count === 1 ? "" : "s"}`}
          onClick={() => selectFilter(key)}
          key={key}
        ><span className="summary-label">{filterLabels[key]}</span><strong>{count}</strong></button>)}
      </div>
      {filter !== "all" && <div className="queue-filter-status" role="status">
        <span>Showing {displayedCards.length} {filterLabels[filter].toLowerCase()} contact{displayedCards.length === 1 ? "" : "s"}</span>
        <button type="button" className="text-button" onClick={() => setFilter("all")}>Clear filter</button>
      </div>}
      {loading && <p className="refresh-note" role="status">Refreshing priorities…</p>}
      {displayedCards.length === 0
        ? <section className="panel empty-state">
            <h2>{filter !== "all" ? `No ${filterLabels[filter].toLowerCase()} contacts` : !data.hasPlacements ? "No placements yet" : scope === "today" ? "You’re all clear today" : "Nothing scheduled in the next 45 days"}</h2>
            <p>{filter !== "all" ? "Choose another priority or clear the filter to see all scheduled work." : !data.hasPlacements ? "Add the first placement to begin scheduling client feedback and check-ins." : "The queue will update when another obligation becomes due."}</p>
            {filter !== "all" ? <button type="button" className="button button-primary" onClick={() => setFilter("all")}>Show all contacts</button> : <Link href={data.hasPlacements ? "/placements" : "/placements/new"} className="button button-primary">{data.hasPlacements ? "Review placements" : "Add placement"}</Link>}
          </section>
        : scope === "upcoming"
          ? <section className="queue-section"><div className="queue-section-heading"><h2>Next 45 days</h2><span>{displayedCards.length} contact{displayedCards.length === 1 ? "" : "s"}</span></div><div className="queue-list">{displayedCards.map((card) => <QueueCardView {...cardProps(card)} key={card.id} />)}</div></section>
          : prioritizedSections(displayedCards).map(([bucket, label]) => {
              const cards = displayedCards.filter((card) => card.bucket === bucket);
              return cards.length ? <section className="queue-section" key={bucket}><div className="queue-section-heading"><h2>{label}</h2><span>{cards.length} contact{cards.length === 1 ? "" : "s"}</span></div><div className="queue-list">{cards.map((card) => <QueueCardView {...cardProps(card)} key={card.id} />)}</div></section> : null;
            })}
    </>}
  </>;
}
