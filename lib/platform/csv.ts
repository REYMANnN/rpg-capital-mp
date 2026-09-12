function cell(value:unknown){ const text=value==null?'':String(value); return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text }
export function toCsv(headers:string[], rows:unknown[][]){ return '\uFEFF'+[headers,...rows].map((row)=>row.map(cell).join(',')).join('\r\n')+'\r\n' }
export function csvResponse(csv:string,filename:string){ return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, no-store'}}) }
