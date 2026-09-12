import { loadInventoryState } from '../inventoryAdapter'
import type { PublicSale } from '../contracts/sales'
export async function listSales(storeId:string,businessId:string): Promise<PublicSale[]> { const state=await loadInventoryState(storeId,businessId); return [...state.sales].sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt))) as PublicSale[] }
export async function getSale(storeId:string,businessId:string,id:string) { return (await listSales(storeId,businessId)).find((sale)=>sale.id===id) ?? null }
