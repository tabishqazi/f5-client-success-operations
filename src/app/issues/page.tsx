import { IssuesList } from '@/components/issues-list';
export const metadata={title:'Issues'};
export default function IssuesPage(){return <><div className="page-heading"><div><h1>Issues</h1><p className="page-description">Agreed actions, verified improvements and senior support.</p></div></div><IssuesList/></>;}
