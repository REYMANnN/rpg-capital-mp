import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'
import { hashApiSecret, parseApiKey, type ApiScope } from './apiKeys'
export type RateClass='read'|'write'|'bulk'|'export'
const RATE_LIMITS:Record<RateClass,number>={read:120,write:30,bulk:20,export:12}
export type PublicApiContext={keyId:string;businessId:string;storeId:string;installationId:string;scopes:ReadonlySet<ApiScope>;keyPrefix:string;requestId:string}
export class PublicApiError extends Error{constructor(public status:number,public code:string,message:string,public retryAfter?:number){super(message)}}
function bearer(request:Request){const value=request.headers.get('authorization')??'';return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
function inferredRate(scope:ApiScope):RateClass{return scope.endsWith(':ingest')?'bulk':scope.endsWith(':write')||scope==='webhooks:manage'?'write':'read'}
function requestedStore(request:Request){const value=request.headers.get('x-rpg-store-id')?.trim()??'';return /^[0-9a-f-]{36}$/i.test(value)?value:null}

export async function requirePublicApi(request:Request,requiredScope:ApiScope,rateClass?:RateClass):Promise<PublicApiContext>{
  const parsed=parseApiKey(bearer(request));if(!parsed)throw new PublicApiError(401,'invalid_api_key','Use uma chave de API válida.')
  const limit=RATE_LIMITS[rateClass??inferredRate(requiredScope)]
  const {data,error}=await createInventoryCloudClient().rpc('balcao_public_api_authenticate',{p_prefix:parsed.prefix,p_secret_hash:hashApiSecret(parsed.secret),p_requested_store_id:requestedStore(request),p_required_scope:requiredScope,p_limit:limit})
  if(error)throw error
  const result=(data??{}) as any
  if(!result.ok){
    const code=String(result.code??'invalid_api_key')
    if(code==='missing_scope')throw new PublicApiError(403,code,`A chave precisa de ${requiredScope}.`)
    if(code==='store_required')throw new PublicApiError(400,code,'Informe X-RPG-Store-Id para uma chave de negócio.')
    if(code==='store_forbidden')throw new PublicApiError(403,code,'Esta chave não acessa essa loja.')
    if(code==='rate_limited')throw new PublicApiError(429,code,'Limite de requisições atingido.',Number(result.retryAfter??60))
    throw new PublicApiError(401,'invalid_api_key','Chave inválida, inativa ou expirada.')
  }
  return{keyId:String(result.keyId),businessId:String(result.businessId),storeId:String(result.storeId),installationId:String(result.installationId),scopes:new Set((Array.isArray(result.scopes)?result.scopes:[]) as ApiScope[]),keyPrefix:parsed.prefix,requestId:`req_${crypto.randomUUID().replace(/-/g,'')}`}
}
export function publicApiError(error:unknown){if(error instanceof PublicApiError)return Response.json({error:{code:error.code,message:error.message}},{status:error.status,headers:{...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{}),'cache-control':'private, no-store'}});console.error('BALCAO public API failed',error);return Response.json({error:{code:'internal_error',message:'Não conseguimos concluir a solicitação.'}},{status:500})}
