"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

const navigation = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/placements", label: "Placements", icon: "people" },
  { href: "/issues", label: "Issues", icon: "issue" },
  { href: "/rules", label: "Rules", icon: "rules" },
] as const;

export function AppShell({ children, dateLabel, operationsDate }: { children: React.ReactNode; dateLabel: string; operationsDate: string }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="F5 Client Success home">
        <Image className="brand-logo" src="/f5-logo.svg" alt="F5 Hiring Solutions" width={267} height={50} priority />
      </Link>
      <div className="nav-label">WORKSPACE</div>
      <nav className="navigation" aria-label="Main navigation">
        {navigation.map((item) => {
          const active=pathname===item.href || (item.href!=='/' && pathname.startsWith(`${item.href}/`));
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span>{active && <span className="active-indicator" />}</Link>;
        })}
      </nav>
      <div className="sidebar-foot"><span className="operator-avatar">OM</span><div>Operations manager<span>Client Success</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="workspace-label">Client Success <span>/</span> Operations</span><div className="topbar-meta"><time dateTime={operationsDate}>{dateLabel}</time></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
      <footer className="workspace-footer"><span>Client relationships. Consistent follow-through.</span><span>Operating calendar · U.S. Eastern</span></footer>
    </div>
  </div>;
}
