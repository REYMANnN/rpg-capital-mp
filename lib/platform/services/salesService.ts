import { loadInventoryState } from '../inventoryAdapter'
import type { PublicSale } from '../contracts/sales'
export async function listSales(storeId:string,businessId:string,installationId?:string):Promise<PublicSale[]>{const state=await loadInventoryState(storeId,businessId,installationId);return[...state.sales].sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt))) as PublicSale[]}
export async function getSale(storeId:string,businessId:string,id:string,installationId?:string){return(await listSales(storeId,businessId,installationId)).find(sale=>sale.id===id)??null}
