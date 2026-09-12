'use client'
import { useEffect,useState } from 'react'
import AutomationError from './AutomationError'
import { automationRequest, AutomationClientError } from '@/lib/platform/automation/client'

export default function IntegrationLogsPanel({storeId}:{storeId:string}){
  const[logs,setLogs]=useState<any[]>([]),[error,setError]=useState<{message:string;code:string}|null>(null)
  async function load(){try{const p=await automationRequest<{logs:any[]}>(`/api/balcao/automations/logs?storeId=${encodeURIComponent(storeId)}`,undefined,'AUT-LOGS-LOAD');setLogs(p.logs??[]);setError(null)}catch(e){const x=e as AutomationClientError;setError({message:x.message,code:x.code})}}
  useEffect(()=>{void load()},[storeId])
  return <section className="rounded-2xl border bg-white p-5"><h3 className="text-lg font-bold">Logs de integração</h3><p className="mt-1 text-sm text-slate-500">Metadados seguros das últimas entregas. Segredos e conteúdo sensível não aparecem aqui.</p>{error?<div className="mt-4"><AutomationError message={error.message} code={error.code} onRetry={()=>void load()}/></div>:null}<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b"><th className="p-2">Quando</th><th className="p-2">Endpoint</th><th className="p-2">Evento</th><th className="p-2">Status</th><th className="p-2">HTTP</th><th className="p-2">Duração</th></tr></thead><tbody>{logs.map(l=><tr key={l.id} className="border-b"><td className="p-2">{new Date(l.created_at).toLocaleString('pt-BR')}</td><td className="p-2">{l.endpointName}</td><td className="p-2">{l.balcao_event_outbox?.event_type??'—'}</td><td className="p-2">{l.status}</td><td className="p-2">{l.response_status??'—'}</td><td className="p-2">{l.duration_ms!=null?`${l.duration_ms} ms`:'—'}</td></tr>)}</tbody></table>{!logs.length&&!error?<p className="p-4 text-center text-sm text-slate-400">Nenhuma entrega registrada ainda.</p>:null}</div></section>
}
