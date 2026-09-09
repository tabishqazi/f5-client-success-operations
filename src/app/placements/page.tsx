import type { Metadata } from "next";
import { PlacementsList } from "@/components/placements-list";
export const metadata: Metadata = { title: "Placements" };

export default function PlacementsPage() {
  return <><div className="page-heading"><div><h1>Placements</h1><p className="page-description">Client relationships and the professionals supporting them.</p></div></div><PlacementsList/></>;
}
