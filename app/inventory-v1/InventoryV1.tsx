'use client'

import { useEffect, useMemo, useState } from 'react'
import { Barcode, Boxes, Camera, Check, ChevronRight, Cloud, CloudOff, Minus, PackagePlus, Plus, RotateCcw, ScanLine, Settings, ShoppingCart, Trash2, X } from 'lucide-react'
import { completeSale, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import QuaggaScanner from './QuaggaScanner'
import styles from './inventory.module.css'

type Unit = 'UN' | 'KG'
type AppProduct = Product & {
  unit: Unit
  averageCostCents: number
  catalogSource?: string
  catalogBrand?: string
  catalogImageUrl?: string
}
type Movement = { id:string; productId:string; type:'initial'|'purchase'|'sale'|'adjustment'; quantityMilli:number; createdAt:string; note:string }
type CartLine = { productId:string; quantityMilli:number; source:'unit' }
type StoreData = { products: AppProduct[]; sales: Sale[]; movements: Movement[]; scaleRule: ScaleRule }
type LookupState =
  | { status:'idle' }
  | { status:'loading'; barcode:string }
  | { status:'found'; barcode:string; source:string; brand:string }
  | { status:'new'; barcode:string }
type CloudState = 'loading'|'syncing'|'synced'|'offline'

type ProductForm = {
  barcode:string
  name:string
  unit:Unit
  price:string
  stock:string
  minStock:string
  cost:string
  catalogSource:string
  catalogBrand:string
  catalogImageUrl:string
}

const DEFAULT_RULE: ScaleRule = { prefix:'', productDigits:0, valueDigits:0, mode:'weight', decimalPlaces:0 }
const STORAGE_KEY = 'rpg-inventory-v1-2026'
const uid = () => crypto.randomUUID()
const money = (c:number) => (c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const qty = (m:number,u:Unit) => u === 'KG' ? `${(m/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} kg` : `${(m/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} un.`
const emptyData = (): StoreData => ({ products:[], sales:[], movements:[], scaleRule:DEFAULT_RULE })
const emptyForm = (): ProductForm => ({barcode:'',name:'',unit:'UN',price:'',stock:'',minStock:'0',cost:'0',catalogSource:'',catalogBrand:'',catalogImageUrl:''})

function validStoreData(value:unknown): value is StoreData {
  if(!value || typeof value!=='object') return false
  const state=value as StoreData
  return Array.isArray(state.products)&&Array.isArray(state.sales)&&Array.isArray(state.movements)
}

async function pushCloudState(state:StoreData) {
  const response=await fetch('/api/inventory/state',{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(state),
  })
  if(!response.ok) throw new Error('cloud_sync_failed')
}

export default function InventoryV1() {
  const [data,setData] = useState<StoreData>(emptyData)
  const [loaded,setLoaded] = useState(false)
  const [cloud,setCloud] = useState<CloudState>('loading')
  const [tab,setTab] = useState<'stock'|'intake'|'checkout'|'settings'>('stock')
  const [cart,setCart] = useState<CartLine[]>([])
  const [scannerOpen,setScannerOpen] = useState(false)
  const [scanTarget,setScanTarget] = useState<'product'|'checkout'>('checkout')
  const [notice,setNotice] = useState('')
  const [error,setError] = useState('')
  const [lookup,setLookup] = useState<LookupState>({status:'idle'})
  const [productForm,setProductForm] = useState<ProductForm>(emptyForm)

  useEffect(()=>{
    let cancelled=false
    async function load(){
      let local=emptyData()
      try{
        const raw=localStorage.getItem(STORAGE_KEY)
        if(raw){
          const parsed=JSON.parse(raw)
          if(validStoreData(parsed)) local={...parsed,scaleRule:parsed.scaleRule||DEFAULT_RULE}
        }
      }catch{}

      try{
        const response=await fetch('/api/inventory/state',{cache:'no-store'})
        const result=await response.json()
        if(cancelled)return
        if(response.ok&&result?.ok&&result?.found&&validStoreData(result.state)){
          const remote={...result.state,scaleRule:result.state.scaleRule||DEFAULT_RULE}
          setData(remote)
          localStorage.setItem(STORAGE_KEY,JSON.stringify(remote))
          setCloud('synced')
        }else{
          setData(local)
          setCloud('synced')
          if(local.products.length||local.sales.length||local.movements.length){
            try{ await pushCloudState(local) }catch{ if(!cancelled)setCloud('offline') }
          }
        }
      }catch{
        if(cancelled)return
        setData(local)
        setCloud('offline')
      }finally{
        if(!cancelled)setLoaded(true)
      }
    }
    void load()
    return()=>{cancelled=true}
  },[])

  useEffect(()=>{
    if(!loaded)return
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data))
    const timer=window.setTimeout(async()=>{
      setCloud('syncing')
      try{ await pushCloudState(data); setCloud('synced') }
      catch{ setCloud('offline') }
    },350)
    return()=>window.clearTimeout(timer)
  },[data,loaded])

  const totalCents = useMemo(()=>cart.reduce((sum,line)=>{
    const p=data.products.find(x=>x.id===line.productId)
    return sum+(p?Math.round(p.priceCents*line.quantityMilli/1000):0)
  },0),[cart,data.products])

  function flash(message:string){ setError(''); setNotice(message); window.setTimeout(()=>setNotice(''),2500) }
  function fail(message:string){ setNotice(''); setError(message) }

  async function prepareProduct(code:string) {
    const existing=data.products.find(p=>p.barcode===code)
    if(existing){
      setLookup({status:'idle'})
      flash(`${existing.name} já está cadastrado no estoque.`)
      return false
    }

    setProductForm({...emptyForm(),barcode:code})
    setLookup({status:'loading',barcode:code})

    try{
      const response=await fetch(`/api/products/lookup?barcode=${encodeURIComponent(code)}`,{cache:'no-store'})
      const result=await response.json()
      if(result?.found&&result?.product?.name){
        setProductForm(f=>({
          ...f,
          barcode:code,
          name:String(result.product.name),
          catalogSource:String(result.source||''),
          catalogBrand:String(result.product.brand||''),
          catalogImageUrl:String(result.product.imageUrl||''),
        }))
        setLookup({status:'found',barcode:code,source:String(result.source||'base de produtos'),brand:String(result.product.brand||'')})
        return true
      }
    }catch{}

    setLookup({status:'new',barcode:code})
    return true
  }

  function saveProduct() {
    const barcode=productForm.barcode.trim(), name=productForm.name.trim()
    if(!barcode || !name) return fail('Informe código e nome do produto.')
    if(!productForm.price.trim()) return fail('Informe o preço de venda.')
    if(!productForm.stock.trim()) return fail('Informe a quantidade inicial, mesmo que seja 0.')
    const priceCents=Math.round(Number(productForm.price.replace(',','.'))*100)
    const stockMilli=Math.round(Number(productForm.stock.replace(',','.'))*1000)
    const minStockMilli=Math.round(Number(productForm.minStock.replace(',','.'))*1000)
    const averageCostCents=Math.round(Number((productForm.cost||'0').replace(',','.'))*100)
    if(!Number.isFinite(priceCents)||priceCents<=0||!Number.isFinite(stockMilli)||stockMilli<0||!Number.isFinite(minStockMilli)||minStockMilli<0||!Number.isFinite(averageCostCents)||averageCostCents<0) return fail('Preço, custo ou estoque inválido.')
    if(data.products.some(p=>p.barcode===barcode)) return fail('Esse código de barras já está cadastrado.')
    const product:AppProduct={
      id:uid(),barcode,name,unit:productForm.unit,priceCents,stockMilli,minStockMilli,averageCostCents,
      catalogSource:productForm.catalogSource||undefined,
      catalogBrand:productForm.catalogBrand||undefined,
      catalogImageUrl:productForm.catalogImageUrl||undefined,
    }
    setData(d=>({...d,products:[...d.products,product],movements:stockMilli?[...d.movements,{id:uid(),productId:product.id,type:'initial',quantityMilli:stockMilli,createdAt:new Date().toISOString(),note:'Estoque inicial'}]:d.movements}))
    setProductForm(emptyForm())
    setLookup({status:'idle'})
    flash('Produto cadastrado.')
  }

  function receive(productId:string, amount:string, cost:string, note:string) {
    const q=Math.round(Number(amount.replace(',','.'))*1000), unitCost=Math.round(Number(cost.replace(',','.'))*100)
    if(!Number.isFinite(q)||q<=0||!Number.isFinite(unitCost)||unitCost<0) return fail('Quantidade ou custo inválido.')
    setData(d=>{
      const p=d.products.find(x=>x.id===productId); if(!p) return d
      const nextStock=p.stockMilli+q
      const weighted=Math.round((p.stockMilli*p.averageCostCents+q*unitCost)/nextStock)
      return {...d,products:d.products.map(x=>x.id===productId?{...x,stockMilli:nextStock,averageCostCents:weighted}:x),movements:[...d.movements,{id:uid(),productId,type:'purchase',quantityMilli:q,createdAt:new Date().toISOString(),note:note||'Entrada manual'}]}
    })
    flash('Entrada registrada no estoque.')
  }

  async function handleCode(raw:string) {
    const code=raw.replace(/\s+/g,'').trim()
    if(!code)return

    if(scanTarget==='product'){
      setScannerOpen(false)
      setTab('stock')
      await prepareProduct(code)
      return
    }

    const p=data.products.find(x=>x.barcode===code)
    if(!p){
      setScannerOpen(false)
      setTab('stock')
      const isNew=await prepareProduct(code)
      if(isNew)flash('Produto ainda não estava no estoque. Complete preço e quantidade para cadastrá-lo.')
      return
    }
    addCart(p,1000)
    setScannerOpen(false)
    flash(`${p.name} adicionado ao carrinho.`)
  }

  function addCart(p:AppProduct,quantityMilli:number){
    setCart(current=>{
      const existing=current.find(x=>x.productId===p.id), total=(existing?.quantityMilli??0)+quantityMilli
      if(total>p.stockMilli){ fail(`Estoque insuficiente: ${p.name} tem ${qty(p.stockMilli,p.unit)}.`); return current }
      if(existing)return current.map(x=>x.productId===p.id?{...x,quantityMilli:total}:x)
      return [...current,{productId:p.id,quantityMilli,source:'unit'}]
    })
  }

  function checkout(){
    if(!cart.length)return
    try{
      const result=completeSale(data.products,cart.map(x=>({productId:x.productId,quantityMilli:x.quantityMilli})),uid())
      const byId=new Map(result.products.map(p=>[p.id,p]))
      const nextProducts=data.products.map(p=>({...p,stockMilli:byId.get(p.id)?.stockMilli??p.stockMilli}))
      const movements:Movement[]=cart.map(x=>({id:uid(),productId:x.productId,type:'sale',quantityMilli:-x.quantityMilli,createdAt:result.sale.createdAt,note:`Venda ${result.sale.id.slice(0,8)}`}))
      setData(d=>({...d,products:nextProducts,sales:[result.sale,...d.sales],movements:[...d.movements,...movements]}))
      setCart([])
      flash(`Venda registrada: ${money(result.sale.totalCents)}.`)
    }catch(e){ fail(e instanceof Error?e.message:'Falha ao concluir venda.') }
  }

  function adjust(productId:string,deltaMilli:number){
    setData(d=>({...d,products:d.products.map(p=>p.id===productId?{...p,stockMilli:Math.max(0,p.stockMilli+deltaMilli)}:p),movements:[...d.movements,{id:uid(),productId,type:'adjustment',quantityMilli:deltaMilli,createdAt:new Date().toISOString(),note:'Ajuste manual'}]}))
  }

  function exportBackup(){ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`rpg-inventario-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href) }
  function importBackup(file:File){ const reader=new FileReader(); reader.onload=()=>{ try{const parsed=JSON.parse(String(reader.result)); if(!validStoreData(parsed))throw new Error(); setData({...parsed,scaleRule:parsed.scaleRule||DEFAULT_RULE}); flash('Backup restaurado.')}catch{fail('Arquivo de backup inválido.')} }; reader.readAsText(file) }

  if(!loaded)return null
  const cloudText=cloud==='synced'?'Nuvem sincronizada':cloud==='syncing'?'Sincronizando…':cloud==='offline'?'Modo local':'Conectando…'
  return <div className={styles.shell}>
    <header className={styles.top}><div><span className={styles.brand}>RPG</span><strong>Mercadinho</strong></div><span className={styles.status}>{cloud==='offline'?<CloudOff/>:<Cloud/>}{INVENTORY_APP_VERSION} · {cloudText} · EAN/UPC</span></header>
    <nav className={styles.nav}>
      <button className={tab==='stock'?styles.active:''} onClick={()=>setTab('stock')}><Boxes/>Estoque</button>
      <button className={tab==='intake'?styles.active:''} onClick={()=>setTab('intake')}><PackagePlus/>Entrada</button>
      <button className={tab==='checkout'?styles.active:''} onClick={()=>setTab('checkout')}><ShoppingCart/>Caixa</button>
      <button className={tab==='settings'?styles.active:''} onClick={()=>setTab('settings')}><Settings/>Ajustes</button>
    </nav>
    <main className={styles.main}>
      {notice&&<div className={styles.success}><Check/>{notice}</div>}
      {error&&<div className={styles.error}>{error}<button onClick={()=>setError('')}><X/></button></div>}
      {tab==='stock'&&<Stock products={data.products} form={productForm} setForm={setProductForm} save={saveProduct} scan={()=>{setScanTarget('product');setScannerOpen(true)}} adjust={adjust} lookup={lookup}/>} 
      {tab==='intake'&&<Intake products={data.products} receive={receive}/>} 
      {tab==='checkout'&&<Checkout products={data.products} cart={cart} total={totalCents} scan={()=>{setScanTarget('checkout');setScannerOpen(true)}} manual={handleCode} change={(id,d)=>setCart(c=>c.map(x=>x.productId===id?{...x,quantityMilli:Math.max(0,x.quantityMilli+d)}:x).filter(x=>x.quantityMilli>0))} remove={id=>setCart(c=>c.filter(x=>x.productId!==id))} checkout={checkout}/>} 
      {tab==='settings'&&<SettingsView cloud={cloudText} exportBackup={exportBackup} importBackup={importBackup} reset={()=>{if(confirm('Apagar todos os dados deste inventário?')){setData(emptyData());setCart([])}}}/>} 
    </main>
    {scannerOpen&&<QuaggaScanner onCode={handleCode} close={()=>setScannerOpen(false)}/>} 
  </div>
}

function Stock({products,form,setForm,save,scan,adjust,lookup}:{products:AppProduct[];form:ProductForm;setForm:(f:ProductForm)=>void;save:()=>void;scan:()=>void;adjust:(id:string,d:number)=>void;lookup:LookupState}){
  const lookupText=lookup.status==='loading'?'Pesquisando produto…':lookup.status==='found'?'Produto identificado':lookup.status==='new'?'Produto novo identificado':''
  return <><section className={styles.hero}><div><span>Inventário</span><h1>Produtos e saldo</h1><p>Escaneie o código de barras da embalagem. Se reconhecermos o EAN, o nome entra automaticamente; você informa preço de venda e quantidade.</p></div><button className={styles.primary} onClick={scan}><Camera/>Escanear produto</button></section>
  <section className={styles.card}><h2>Novo produto</h2>{lookup.status!=='idle'&&<div style={{marginBottom:14,padding:'12px 14px',borderRadius:12,border:'1px solid #b8d7be',background:'#eef8f0'}}><strong style={{display:'block'}}>{lookupText}</strong>{lookup.status==='found'&&<small>{lookup.brand?`${lookup.brand} · `:''}nome obtido via {lookup.source}</small>}{lookup.status==='new'&&<small>EAN {lookup.barcode} não foi encontrado na base. Informe o nome para cadastrá-lo.</small>}</div>}<div className={styles.formgrid}><input placeholder="Código de barras (EAN)" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/><input placeholder="Nome do produto" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value as Unit})}><option value="UN">Unidade</option><option value="KG">Quilo</option></select><input placeholder="Preço de venda R$" inputMode="decimal" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><input placeholder={form.unit==='KG'?'Quantidade inicial em kg':'Quantidade inicial em unidades'} inputMode="decimal" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/><input placeholder="Custo médio R$ (opcional)" inputMode="decimal" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/><input placeholder="Estoque mínimo" inputMode="decimal" value={form.minStock} onChange={e=>setForm({...form,minStock:e.target.value})}/></div><button className={styles.primary} onClick={save} disabled={lookup.status==='loading'}>Cadastrar produto</button></section>
  <section className={styles.productlist}>{products.length===0?<div className={styles.empty}><Boxes/><b>Nenhum produto</b><span>Use “Escanear produto” para começar.</span></div>:products.map(p=><article className={styles.product} key={p.id}><div className={styles.producticon}><Barcode/></div><div className={styles.grow}><b>{p.name}</b><small>{p.barcode}{p.catalogBrand?` · ${p.catalogBrand}`:''}</small><div className={styles.pills}><span>{money(p.priceCents)}</span><span>Custo {money(p.averageCostCents)}</span></div></div><div className={p.stockMilli<=p.minStockMilli?styles.low:styles.stockqty}><strong>{qty(p.stockMilli,p.unit)}</strong><small>{p.stockMilli<=p.minStockMilli?'Estoque baixo':'Disponível'}</small></div><div className={styles.adjust}><button onClick={()=>adjust(p.id,-1000)}><Minus/></button><button onClick={()=>adjust(p.id,1000)}><Plus/></button></div></article>)}</section></>
}

function Intake({products,receive}:{products:AppProduct[];receive:(id:string,q:string,c:string,n:string)=>void}){
 const [id,setId]=useState(''),[q,setQ]=useState(''),[c,setC]=useState(''),[note,setNote]=useState('')
 return <><section className={styles.hero}><div><span>Recebimento</span><h1>Entrada rápida</h1><p>Registre mercadoria recebida. DANFE automática entra depois desta validação física.</p></div></section><section className={styles.card}><div className={styles.stack}><label>Produto<select value={id} onChange={e=>setId(e.target.value)}><option value="">Selecione...</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Quantidade<input inputMode="decimal" value={q} onChange={e=>setQ(e.target.value)} placeholder="Ex.: 12"/></label><label>Custo por unidade/kg<input inputMode="decimal" value={c} onChange={e=>setC(e.target.value)} placeholder="Ex.: 4,20"/></label><label>Referência<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Fornecedor / nota"/></label><button className={styles.primary} disabled={!id} onClick={()=>{receive(id,q,c,note);setQ('');setC('');setNote('')}}>Confirmar entrada <ChevronRight/></button></div></section></>
}

function Checkout({products,cart,total,scan,manual,change,remove,checkout}:{products:AppProduct[];cart:CartLine[];total:number;scan:()=>void;manual:(s:string)=>void|Promise<void>;change:(id:string,d:number)=>void;remove:(id:string)=>void;checkout:()=>void}){
 const [code,setCode]=useState('')
 return <><section className={styles.hero}><div><span>Checkout</span><h1>Caixa</h1><p>Leia o código de barras do produto. Se o EAN ainda não existir no estoque, abrimos o cadastro automaticamente.</p></div><button className={styles.primary} onClick={scan}><ScanLine/>Escanear item</button></section><section className={styles.scanbar}><input inputMode="numeric" placeholder="Leitor USB / código manual de reserva" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&code.trim()){void manual(code);setCode('')}}}/><button onClick={()=>{void manual(code);setCode('')}}>Adicionar</button></section><section className={styles.checkoutgrid}><div className={styles.productlist}>{cart.length===0?<div className={styles.empty}><ShoppingCart/><b>Carrinho vazio</b><span>Toque em “Escanear item”.</span></div>:cart.map(line=>{const p=products.find(x=>x.id===line.productId);if(!p)return null;return <article className={styles.cartline} key={line.productId}><div className={styles.grow}><b>{p.name}</b><small>Código unitário · {qty(line.quantityMilli,p.unit)}</small></div><div className={styles.cartstep}><button onClick={()=>change(p.id,-1000)}><Minus/></button><strong>{qty(line.quantityMilli,p.unit)}</strong><button onClick={()=>change(p.id,1000)}><Plus/></button></div><b>{money(Math.round(p.priceCents*line.quantityMilli/1000))}</b><button className={styles.trash} onClick={()=>remove(p.id)}><Trash2/></button></article>})}</div><aside className={styles.total}><span>Total</span><strong>{money(total)}</strong><button className={styles.pay} disabled={!cart.length} onClick={checkout}>CONFIRMAR VENDA</button><small>A baixa é salva localmente e sincronizada com o banco.</small></aside></section></>
}

function SettingsView({cloud,exportBackup,importBackup,reset}:{cloud:string;exportBackup:()=>void;importBackup:(f:File)=>void;reset:()=>void}){
 return <><section className={styles.hero}><div><span>Configuração</span><h1>Inventário</h1><p>Versão {INVENTORY_APP_VERSION}. A leitura de etiquetas de balança foi deixada para uma etapa posterior.</p></div></section><section className={styles.card}><h2>Persistência</h2><p>{cloud}. O navegador mantém uma cópia local para o caixa continuar operando sem internet; quando disponível, o estado também é sincronizado com o banco.</p></section><section className={styles.card}><h2>Backup</h2><div className={styles.actions}><button className={styles.secondary} onClick={exportBackup}>Exportar backup JSON</button><label className={styles.secondary}>Importar backup<input hidden type="file" accept="application/json" onChange={e=>{const f=e.target.files?.[0];if(f)importBackup(f)}}/></label><button className={styles.danger} onClick={reset}><RotateCcw/>Apagar dados do inventário</button></div></section></>
}
