'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Barcode, Boxes, Camera, Check, ChevronRight, Minus, PackagePlus, Plus, RotateCcw, ScanLine, Settings, ShoppingCart, Trash2, X } from 'lucide-react'
import { completeSale, parseScaleLabel, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'
import styles from './inventory.module.css'

type Unit = 'UN' | 'KG'
type AppProduct = Product & { unit: Unit; averageCostCents: number }
type Movement = { id:string; productId:string; type:'initial'|'purchase'|'sale'|'adjustment'; quantityMilli:number; createdAt:string; note:string }
type CartLine = { productId:string; quantityMilli:number; source:'unit'|'scale' }
type StoreData = { products: AppProduct[]; sales: Sale[]; movements: Movement[]; scaleRule: ScaleRule }

const DEFAULT_RULE: ScaleRule = { prefix:'20', productDigits:5, valueDigits:5, mode:'weight', decimalPlaces:3 }
const STORAGE_KEY = 'rpg-inventory-v1-2026'
const uid = () => crypto.randomUUID()
const money = (c:number) => (c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const qty = (m:number,u:Unit) => u === 'KG' ? `${(m/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} kg` : `${(m/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} un.`

function emptyData(): StoreData { return { products:[], sales:[], movements:[], scaleRule:DEFAULT_RULE } }

export default function InventoryV1() {
  const [data,setData] = useState<StoreData>(emptyData)
  const [loaded,setLoaded] = useState(false)
  const [tab,setTab] = useState<'stock'|'intake'|'checkout'|'settings'>('stock')
  const [cart,setCart] = useState<CartLine[]>([])
  const [scannerOpen,setScannerOpen] = useState(false)
  const [scanTarget,setScanTarget] = useState<'product'|'checkout'>('checkout')
  const [notice,setNotice] = useState('')
  const [error,setError] = useState('')
  const [productForm,setProductForm] = useState({ barcode:'',scaleCode:'',name:'',unit:'UN' as Unit,price:'',stock:'',minStock:'0',cost:'0' })

  useEffect(()=>{
    try { const raw=localStorage.getItem(STORAGE_KEY); if(raw) setData(JSON.parse(raw)) } catch {}
    setLoaded(true)
  },[])
  useEffect(()=>{ if(loaded) localStorage.setItem(STORAGE_KEY,JSON.stringify(data)) },[data,loaded])

  const totalCents = useMemo(()=>cart.reduce((sum,line)=>{
    const p=data.products.find(x=>x.id===line.productId); return sum+(p?Math.round(p.priceCents*line.quantityMilli/1000):0)
  },0),[cart,data.products])

  function flash(message:string){ setError(''); setNotice(message); setTimeout(()=>setNotice(''),2500) }
  function fail(message:string){ setNotice(''); setError(message) }

  function saveProduct() {
    const barcode=productForm.barcode.trim(), name=productForm.name.trim()
    if(!barcode || !name) return fail('Informe código e nome do produto.')
    const priceCents=Math.round(Number(productForm.price.replace(',','.'))*100)
    const stockMilli=Math.round(Number(productForm.stock.replace(',','.'))*1000)
    const minStockMilli=Math.round(Number(productForm.minStock.replace(',','.'))*1000)
    const averageCostCents=Math.round(Number(productForm.cost.replace(',','.'))*100)
    if(!Number.isFinite(priceCents)||priceCents<0||!Number.isFinite(stockMilli)||stockMilli<0) return fail('Preço ou estoque inválido.')
    if(data.products.some(p=>p.barcode===barcode)) return fail('Esse código de barras já está cadastrado.')
    const product:AppProduct={id:uid(),barcode,scaleCode:productForm.scaleCode.trim()||undefined,name,unit:productForm.unit,priceCents,stockMilli,minStockMilli,averageCostCents}
    setData(d=>({...d,products:[...d.products,product],movements:stockMilli?[...d.movements,{id:uid(),productId:product.id,type:'initial',quantityMilli:stockMilli,createdAt:new Date().toISOString(),note:'Estoque inicial'}]:d.movements}))
    setProductForm({barcode:'',scaleCode:'',name:'',unit:'UN',price:'',stock:'',minStock:'0',cost:'0'}); flash('Produto cadastrado.')
  }

  function receive(productId:string, amount:string, cost:string, note:string) {
    const q=Math.round(Number(amount.replace(',','.'))*1000), unitCost=Math.round(Number(cost.replace(',','.'))*100)
    if(!Number.isFinite(q)||q<=0||!Number.isFinite(unitCost)||unitCost<0) return fail('Quantidade ou custo inválido.')
    setData(d=>{
      const p=d.products.find(x=>x.id===productId); if(!p) return d
      const nextStock=p.stockMilli+q
      const weighted=nextStock===0?unitCost:Math.round((p.stockMilli*p.averageCostCents+q*unitCost)/nextStock)
      return {...d,products:d.products.map(x=>x.id===productId?{...x,stockMilli:nextStock,averageCostCents:weighted}:x),movements:[...d.movements,{id:uid(),productId,type:'purchase',quantityMilli:q,createdAt:new Date().toISOString(),note:note||'Entrada manual'}]}
    }); flash('Entrada registrada no estoque.')
  }

  function handleCode(raw:string) {
    const code=raw.trim(); if(!code) return
    if(scanTarget==='product'){ setProductForm(f=>({...f,barcode:code})); setScannerOpen(false); return }
    const parsed=parseScaleLabel(code,data.scaleRule)
    if(parsed.kind==='barcode'){
      const p=data.products.find(x=>x.barcode===parsed.code); if(!p) return fail(`Produto ${parsed.code} não encontrado.`)
      addCart(p,1000,'unit'); setScannerOpen(false); return
    }
    const p=data.products.find(x=>x.scaleCode===parsed.productCode); if(!p) return fail(`Código de balança ${parsed.productCode} não está ligado a um produto.`)
    let quantityMilli=1000
    if(parsed.quantity!==undefined) quantityMilli=Math.max(1,Math.round(parsed.quantity*1000))
    else if(parsed.encodedPriceCents!==undefined){ if(p.priceCents<=0)return fail('Produto de balança está sem preço por kg/unidade.'); quantityMilli=Math.max(1,Math.round(parsed.encodedPriceCents/p.priceCents*1000)) }
    addCart(p,quantityMilli,'scale'); setScannerOpen(false)
  }

  function addCart(p:AppProduct,quantityMilli:number,source:'unit'|'scale'){
    setCart(current=>{
      const existing=current.find(x=>x.productId===p.id), total=(existing?.quantityMilli??0)+quantityMilli
      if(total>p.stockMilli){ fail(`Estoque insuficiente: ${p.name} tem ${qty(p.stockMilli,p.unit)}.`); return current }
      if(existing) return current.map(x=>x.productId===p.id?{...x,quantityMilli:total}:x)
      return [...current,{productId:p.id,quantityMilli,source}]
    })
  }

  function checkout(){
    if(!cart.length)return
    try{
      const result=completeSale(data.products,cart.map(x=>({productId:x.productId,quantityMilli:x.quantityMilli})),uid())
      const byId=new Map(result.products.map(p=>[p.id,p]))
      const nextProducts=data.products.map(p=>({...p,stockMilli:byId.get(p.id)?.stockMilli??p.stockMilli}))
      const movements:Movement[]=cart.map(x=>({id:uid(),productId:x.productId,type:'sale',quantityMilli:-x.quantityMilli,createdAt:result.sale.createdAt,note:`Venda ${result.sale.id.slice(0,8)}`}))
      setData(d=>({...d,products:nextProducts,sales:[result.sale,...d.sales],movements:[...d.movements,...movements]})); setCart([]); flash(`Venda registrada: ${money(result.sale.totalCents)}.`)
    }catch(e){ fail(e instanceof Error?e.message:'Falha ao concluir venda.') }
  }

  function adjust(productId:string,deltaMilli:number){
    setData(d=>({...d,products:d.products.map(p=>p.id===productId?{...p,stockMilli:Math.max(0,p.stockMilli+deltaMilli)}:p),movements:[...d.movements,{id:uid(),productId,type:'adjustment',quantityMilli:deltaMilli,createdAt:new Date().toISOString(),note:'Ajuste manual'}]}))
  }

  function exportBackup(){ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`rpg-inventario-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href) }
  function importBackup(file:File){ const reader=new FileReader(); reader.onload=()=>{ try{const parsed=JSON.parse(String(reader.result)); if(!Array.isArray(parsed.products)||!Array.isArray(parsed.sales)||!parsed.scaleRule)throw new Error(); setData(parsed); flash('Backup restaurado.')}catch{fail('Arquivo de backup inválido.')} }; reader.readAsText(file) }

  if(!loaded)return null
  return <div className={styles.shell}>
    <header className={styles.top}><div><span className={styles.brand}>RPG</span><strong>Mercadinho</strong></div><span className={styles.status}>V1 local · teste real</span></header>
    <nav className={styles.nav}>
      <button className={tab==='stock'?styles.active:''} onClick={()=>setTab('stock')}><Boxes/>Estoque</button>
      <button className={tab==='intake'?styles.active:''} onClick={()=>setTab('intake')}><PackagePlus/>Entrada</button>
      <button className={tab==='checkout'?styles.active:''} onClick={()=>setTab('checkout')}><ShoppingCart/>Caixa</button>
      <button className={tab==='settings'?styles.active:''} onClick={()=>setTab('settings')}><Settings/>Ajustes</button>
    </nav>
    <main className={styles.main}>
      {notice&&<div className={styles.success}><Check/>{notice}</div>}{error&&<div className={styles.error}>{error}<button onClick={()=>setError('')}><X/></button></div>}
      {tab==='stock'&&<Stock products={data.products} form={productForm} setForm={setProductForm} save={saveProduct} scan={()=>{setScanTarget('product');setScannerOpen(true)}} adjust={adjust}/>} 
      {tab==='intake'&&<Intake products={data.products} receive={receive}/>} 
      {tab==='checkout'&&<Checkout products={data.products} cart={cart} total={totalCents} scan={()=>{setScanTarget('checkout');setScannerOpen(true)}} manual={handleCode} change={(id,d)=>setCart(c=>c.map(x=>x.productId===id?{...x,quantityMilli:Math.max(0,x.quantityMilli+d)}:x).filter(x=>x.quantityMilli>0))} remove={id=>setCart(c=>c.filter(x=>x.productId!==id))} checkout={checkout}/>} 
      {tab==='settings'&&<SettingsView rule={data.scaleRule} setRule={r=>setData(d=>({...d,scaleRule:r}))} exportBackup={exportBackup} importBackup={importBackup} reset={()=>{if(confirm('Apagar todos os dados locais desta V1?')){setData(emptyData());setCart([])}}}/>} 
    </main>
    {scannerOpen&&<Scanner onCode={handleCode} close={()=>setScannerOpen(false)}/>} 
  </div>
}

function Stock({products,form,setForm,save,scan,adjust}:{products:AppProduct[];form:any;setForm:(f:any)=>void;save:()=>void;scan:()=>void;adjust:(id:string,d:number)=>void}){
  return <><section className={styles.hero}><div><span>Inventário</span><h1>Produtos e saldo</h1><p>Cadastre pelo código da embalagem ou associe um código interno de balança.</p></div><button className={styles.primary} onClick={scan}><Camera/>Ler código</button></section>
  <section className={styles.card}><h2>Novo produto</h2><div className={styles.formgrid}><input placeholder="Código de barras (EAN)" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/><input placeholder="Nome do produto" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="Código balança, ex. 00123" value={form.scaleCode} onChange={e=>setForm({...form,scaleCode:e.target.value})}/><select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option value="UN">Unidade</option><option value="KG">Quilo</option></select><input placeholder="Preço venda R$" inputMode="decimal" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><input placeholder="Custo médio R$" inputMode="decimal" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/><input placeholder="Estoque inicial" inputMode="decimal" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/><input placeholder="Estoque mínimo" inputMode="decimal" value={form.minStock} onChange={e=>setForm({...form,minStock:e.target.value})}/></div><button className={styles.primary} onClick={save}>Cadastrar produto</button></section>
  <section className={styles.productlist}>{products.length===0?<div className={styles.empty}><Boxes/><b>Nenhum produto</b><span>Cadastre o primeiro item acima.</span></div>:products.map(p=><article className={styles.product} key={p.id}><div className={styles.producticon}><Barcode/></div><div className={styles.grow}><b>{p.name}</b><small>{p.barcode}{p.scaleCode?` · balança ${p.scaleCode}`:''}</small><div className={styles.pills}><span>{money(p.priceCents)}</span><span>Custo {money(p.averageCostCents)}</span></div></div><div className={p.stockMilli<=p.minStockMilli?styles.low:styles.stockqty}><strong>{qty(p.stockMilli,p.unit)}</strong><small>{p.stockMilli<=p.minStockMilli?'Estoque baixo':'Disponível'}</small></div><div className={styles.adjust}><button onClick={()=>adjust(p.id,-1000)}><Minus/></button><button onClick={()=>adjust(p.id,1000)}><Plus/></button></div></article>)}</section></>
}

function Intake({products,receive}:{products:AppProduct[];receive:(id:string,q:string,c:string,n:string)=>void}){
 const [id,setId]=useState(''),[q,setQ]=useState(''),[c,setC]=useState(''),[note,setNote]=useState('')
 return <><section className={styles.hero}><div><span>Recebimento</span><h1>Entrada rápida</h1><p>Registre mercadoria recebida. DANFE automática entra depois desta validação física.</p></div></section><section className={styles.card}><div className={styles.stack}><label>Produto<select value={id} onChange={e=>setId(e.target.value)}><option value="">Selecione...</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Quantidade<input inputMode="decimal" value={q} onChange={e=>setQ(e.target.value)} placeholder="Ex.: 12"/></label><label>Custo por unidade/kg<input inputMode="decimal" value={c} onChange={e=>setC(e.target.value)} placeholder="Ex.: 4,20"/></label><label>Referência<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Fornecedor / nota"/></label><button className={styles.primary} disabled={!id} onClick={()=>{receive(id,q,c,note);setQ('');setC('');setNote('')}}>Confirmar entrada <ChevronRight/></button></div></section></>
}

function Checkout({products,cart,total,scan,manual,change,remove,checkout}:{products:AppProduct[];cart:CartLine[];total:number;scan:()=>void;manual:(s:string)=>void;change:(id:string,d:number)=>void;remove:(id:string)=>void;checkout:()=>void}){
 const [code,setCode]=useState('')
 return <><section className={styles.hero}><div><span>Checkout</span><h1>Caixa</h1><p>Leia EAN unitário ou etiqueta de balança. O mesmo produto lido de novo soma ao carrinho.</p></div><button className={styles.primary} onClick={scan}><ScanLine/>Abrir câmera</button></section><section className={styles.scanbar}><input autoFocus inputMode="numeric" placeholder="Escaneie ou digite o código" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&code.trim()){manual(code);setCode('')}}}/><button onClick={()=>{manual(code);setCode('')}}>Adicionar</button></section><section className={styles.checkoutgrid}><div className={styles.productlist}>{cart.length===0?<div className={styles.empty}><ShoppingCart/><b>Carrinho vazio</b><span>Leia um produto para começar.</span></div>:cart.map(line=>{const p=products.find(x=>x.id===line.productId)!;return <article className={styles.cartline} key={line.productId}><div className={styles.grow}><b>{p.name}</b><small>{line.source==='scale'?'Etiqueta de balança':'Código unitário'} · {qty(line.quantityMilli,p.unit)}</small></div><div className={styles.cartstep}><button onClick={()=>change(p.id,-1000)}><Minus/></button><strong>{qty(line.quantityMilli,p.unit)}</strong><button onClick={()=>change(p.id,1000)}><Plus/></button></div><b>{money(Math.round(p.priceCents*line.quantityMilli/1000))}</b><button className={styles.trash} onClick={()=>remove(p.id)}><Trash2/></button></article>})}</div><aside className={styles.total}><span>Total</span><strong>{money(total)}</strong><button className={styles.pay} disabled={!cart.length} onClick={checkout}>CONFIRMAR VENDA</button><small>A baixa de todos os itens acontece em uma única operação local.</small></aside></section></>
}

function SettingsView({rule,setRule,exportBackup,importBackup,reset}:{rule:ScaleRule;setRule:(r:ScaleRule)=>void;exportBackup:()=>void;importBackup:(f:File)=>void;reset:()=>void}){
 return <><section className={styles.hero}><div><span>Configuração</span><h1>Etiqueta de balança</h1><p>A etiqueta varia por loja. Configure como o código impresso deve ser interpretado.</p></div></section><section className={styles.card}><div className={styles.formgrid}><label>Prefixo<input value={rule.prefix} onChange={e=>setRule({...rule,prefix:e.target.value})}/></label><label>Dígitos do produto<input type="number" value={rule.productDigits} onChange={e=>setRule({...rule,productDigits:Number(e.target.value)})}/></label><label>Dígitos do valor<input type="number" value={rule.valueDigits} onChange={e=>setRule({...rule,valueDigits:Number(e.target.value)})}/></label><label>Conteúdo<select value={rule.mode} onChange={e=>setRule({...rule,mode:e.target.value as 'weight'|'price'})}><option value="weight">Peso</option><option value="price">Preço</option></select></label><label>Casas decimais<input type="number" value={rule.decimalPlaces} onChange={e=>setRule({...rule,decimalPlaces:Number(e.target.value)})}/></label></div><div className={styles.example}><b>Exemplo padrão</b><code>20 00123 01250 7</code><span>prefixo · produto · valor · dígito final</span></div></section><section className={styles.card}><h2>Dados locais</h2><div className={styles.actions}><button className={styles.secondary} onClick={exportBackup}>Exportar backup JSON</button><label className={styles.secondary}>Importar backup<input hidden type="file" accept="application/json" onChange={e=>{const f=e.target.files?.[0];if(f)importBackup(f)}}/></label><button className={styles.danger} onClick={reset}><RotateCcw/>Apagar dados desta V1</button></div></section></>
}

function Scanner({onCode,close}:{onCode:(s:string)=>void;close:()=>void}){
 const video=useRef<HTMLVideoElement>(null),[manual,setManual]=useState(''),[message,setMessage]=useState('Abrindo câmera...')
 useEffect(()=>{let stream:MediaStream|undefined,timer:number|undefined,stopped=false; async function start(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(video.current)video.current.srcObject=stream; const Detector=(window as any).BarcodeDetector;if(!Detector){setMessage('Leitura automática não disponível neste navegador. Use o campo abaixo ou leitor USB.');return}const detector=new Detector({formats:['ean_13','ean_8','code_128','upc_a','upc_e']});setMessage('Aponte o código para a moldura.');const tick=async()=>{if(stopped||!video.current)return;try{const hits=await detector.detect(video.current);if(hits?.[0]?.rawValue){stopped=true;onCode(hits[0].rawValue);return}}catch{}timer=window.setTimeout(tick,250)};tick()}catch{setMessage('Não foi possível abrir a câmera. Digite o código abaixo.')}}start();return()=>{stopped=true;if(timer)clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop())}},[onCode])
 return <div className={styles.overlay}><section className={styles.scanner}><button className={styles.close} onClick={close}><X/></button><span>Scanner</span><h2>Leia o código</h2><div className={styles.videowrap}><video ref={video} autoPlay muted playsInline/><i/></div><p>{message}</p><div className={styles.scanmanual}><input autoFocus inputMode="numeric" value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&manual)onCode(manual)}} placeholder="Código manual / leitor USB"/><button onClick={()=>manual&&onCode(manual)}>Usar</button></div></section></div>
}
