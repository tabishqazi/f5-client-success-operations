import 'server-only';
import { NextRequest,NextResponse } from 'next/server';
import { DomainError,toErrorEnvelope } from '@/domain/errors';
import { resolveSession,SESSION_COOKIE,rateLimit } from './context';

export function checkOrigin(request:NextRequest) {
 const allowed=process.env.APP_ORIGIN;
 if(!allowed || request.headers.get('origin')!==new URL(allowed).origin) throw new DomainError('FORBIDDEN','Invalid origin');
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new DomainError('FORBIDDEN','Cross-site request');
}
export async function readBody(request:NextRequest):Promise<Record<string,unknown>> {
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new DomainError('INVALID_RANGE','JSON required');
 const reader=request.body?.getReader();
 if(!reader)throw new DomainError('INVALID_RANGE','JSON required');
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){
  const {value,done}=await reader.read();if(done)break;
  length+=value.byteLength;
  if(length>16384){await reader.cancel();throw new DomainError('INVALID_RANGE','Request too large');}
  chunks.push(value);
 }
 const text=Buffer.concat(chunks).toString('utf8');
 try { const value=JSON.parse(text);if(!value || typeof value!=='object' || Array.isArray(value))throw new Error();return value; }
 catch{throw new DomainError('INVALID_RANGE','Invalid JSON');}
}
export async function withWorkspace(request:NextRequest, handler:(w:string)=>Promise<unknown>) {
 return safely(async()=>{
  if(request.method!=='GET')checkOrigin(request);
  const w=await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if(request.method!=='GET')await rateLimit(`write:${w}`,60,60);
  return handler(w);
 });
}
export async function safely(handler:()=>Promise<unknown>) {
 try{return NextResponse.json(await handler(),{headers:{'Cache-Control':'no-store'}});}
 catch(error){
  const body=toErrorEnvelope(error);
  const code=body.error.code;
  const status=code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:code==='VERSION_CONFLICT'?409:code==='RATE_LIMITED'?429:code==='UNAVAILABLE'?503:code==='INTERNAL_ERROR'?500:400;
  if(status>=500)console.error('Request failed',{code: error instanceof DomainError?error.code:'INTERNAL_ERROR'});
  return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 }
}
