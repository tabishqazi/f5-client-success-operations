"use client";
import { useCallback,useEffect,useState } from 'react';
let bootstrap:Promise<void>|undefined;
export async function api<T>(path:string,options?:RequestInit):Promise<T> {
 const response=await fetch(path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',...options?.headers}});
 const body=await response.json();
 if(!response.ok)throw new Error(response.status===403?'Your workspace session has expired or is unavailable. Reload this page to start a new workspace.':body.error?.message??'Unable to load this information. Please retry.');
 return body as T;
}
export async function ensureWorkspace() {
 bootstrap??=api('/api/workspace',{method:'POST'}).then(()=>{}).catch(error=>{bootstrap=undefined;throw error;});
 await bootstrap;
}
export function useWorkspaceData<T>(path:string) {
 const [state,setState]=useState<{path:string;data?:T;error:string}>({path,error:''});
 const [loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 const reload=useCallback(()=>{setLoading(true);setRevision(value=>value+1);},[]);
 useEffect(()=>{
  let canceled=false;
  async function load(){
   try{
    await ensureWorkspace();const data=await api<T>(path);
    if(!canceled)setState({path,data,error:''});
   }catch(e){if(!canceled)setState(previous=>({path,data:previous.path===path?previous.data:undefined,error:e instanceof Error?e.message:'Unable to load this information.'}));}
   finally{if(!canceled)setLoading(false);}
  }
  void load();return ()=>{canceled=true;};
 },[path,revision]);
 return {data:state.path===path?state.data:undefined,error:state.path===path?state.error:'',loading:loading||state.path!==path,reload};
}
export function displayDate(value:string|null|undefined):string {
 if(!value)return 'Not set';
 const instant=value.length===10?`${value}T12:00:00Z`:value;
 return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}).format(new Date(instant));
}
