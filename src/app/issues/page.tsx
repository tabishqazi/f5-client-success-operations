import { IssuesList } from '@/components/issues-list';
export const metadata={title:'Issues'};
export default async function IssuesPage({searchParams}:{searchParams:Promise<{issue?:string|string[]}>}){
 const issue=(await searchParams).issue;const selectedIssueId=typeof issue==='string'?issue:undefined;
 return <><div className="page-heading"><div><h1>Issues</h1><p className="page-description">Agreed actions, verified improvements and senior support.</p></div></div><IssuesList selectedIssueId={selectedIssueId}/></>;
}
