'use client'

export class AutomationClientError extends Error {
  constructor(message:string, public code:string, public status:number){ super(message) }
}

export async function automationRequest<T>(url:string, init:RequestInit|undefined, fallbackCode:string):Promise<T>{
  let response:Response
  try{ response=await fetch(url,{...init,headers:{...(init?.body?{'content-type':'application/json'}:{}),...(init?.headers??{})}}) }
  catch{ throw new AutomationClientError('Não foi possível falar com o BALCÃO. Verifique sua conexão e tente novamente.',fallbackCode,0) }
  const payload=await response.json().catch(()=>({})) as any
  if(!response.ok){throw new AutomationClientError(String(payload?.error?.message??payload?.error??'Não conseguimos concluir esta ação.'),String(payload?.error?.code??fallbackCode),response.status)}
  return payload as T
}
