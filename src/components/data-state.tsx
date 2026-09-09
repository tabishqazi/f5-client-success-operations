export function DataState({error,loading,retry,kind='default'}:{error:string;loading:boolean;retry:()=>void;kind?:'default'|'queue'}) {
 if(error)return <div className="data-message" role="alert"><h2>Unable to load this information</h2><p>{error}</p><p>Any records still shown are from the last successful load.</p><button className="button button-primary" onClick={retry}>Try again</button></div>;
 if(loading)return <div className="data-message" role="status" aria-label="Loading workspace"><div className="skeleton skeleton-summary"/>{kind==='queue'&&<div className="queue-skeletons" aria-hidden="true"><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div>}<p>Loading workspace…</p></div>;
 return null;
}
