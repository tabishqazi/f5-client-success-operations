import { NextRequest } from 'next/server';
import { withWorkspace } from '@/server/http';
import { getLookups } from '@/server/placements';
export async function GET(request:NextRequest){return withWorkspace(request,getLookups);}
