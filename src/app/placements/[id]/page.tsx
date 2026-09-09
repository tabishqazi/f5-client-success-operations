import { PlacementDetail } from '@/components/placement-detail';
export default async function Page({params}:{params:Promise<{id:string}>}){return <PlacementDetail id={(await params).id}/>;}
