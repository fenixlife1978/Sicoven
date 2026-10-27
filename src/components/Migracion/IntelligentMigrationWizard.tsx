import React, { useMemo, useState } from 'react';
import { FileUp, X, CheckCircle2, AlertTriangle, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { parseDelimitedRecords, parseMigrationNumber } from '../../types/migrationParsing';
import { useAccounting } from '../../context/AccountingContext';

type Row = Record<string, unknown>;
type ModuleId = 'inventory' | 'customers' | 'receivables' | 'payables' | 'sales' | 'purchases' | 'accounts' | 'journal';
type ModuleInfo = { id: ModuleId; name: string; aliases: string[]; fields: string[]; transactional: boolean };
const MODULES: ModuleInfo[] = [
 { id:'inventory', name:'Inventario / productos', aliases:['code','codigo','sku','name','nombre','product','producto','currentstock','existencia'], fields:['code','name'], transactional:false },
 { id:'customers', name:'Clientes', aliases:['customername','clientename','customer','cliente','customerRif','rifcliente'], fields:['name','rif'], transactional:false },
 { id:'receivables', name:'Cuentas por cobrar (CxC)', aliases:['customername','invoiceNumber','factura','saldo','dueDate','vencimiento'], fields:['invoiceNumber','totalAmountBs'], transactional:true },
 { id:'payables', name:'Cuentas por pagar (CxP)', aliases:['supplierName','proveedor','supplierRif','invoiceNumber','saldo'], fields:['invoiceNumber','totalAmountBs'], transactional:true },
 { id:'sales', name:'Ventas / facturas', aliases:['invoiceDate','invoiceNumber','customerRif','customerName','vatAmountBs'], fields:['invoiceDate','invoiceNumber','totalAmountBs'], transactional:true },
 { id:'purchases', name:'Compras / facturas', aliases:['invoiceDate','invoiceNumber','supplierRif','supplierName','vatAmountBs'], fields:['invoiceDate','invoiceNumber','totalAmountBs'], transactional:true },
 { id:'accounts', name:'Plan de cuentas', aliases:['accountCode','accountName','accountType','codigo cuenta','nombre cuenta'], fields:['code','name','type'], transactional:false },
 { id:'journal', name:'Asientos contables', aliases:['entryNumber','accountCode','debitBs','creditBs','fecha','debe','haber'], fields:['date','items'], transactional:true }
];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const parseCsv = (text: string): Row[] => parseDelimitedRecords(text);
const scalar = (v: unknown): unknown => {
 if (v && typeof v === 'object' && 'text' in v) return (v as {text:unknown}).text;
 if (v && typeof v === 'object' && 'result' in v) return (v as {result:unknown}).result;
 if (v instanceof Date) return v.toISOString().slice(0,10);
 return v;
};
const toRows = (matrix: unknown[][]): Row[] => {
 if(matrix.length<2) return [];
 const headers=matrix[0].map(v=>norm(String(scalar(v)??'')));
 return matrix.slice(1).filter(r=>r.some(v=>String(scalar(v)??'').trim())).map(r=>{
  const obj:Row={}; headers.forEach((h,i)=>{if(h)obj[h]=scalar(r[i]);}); return obj;
 });
};
const pick = (row:Row, ...keys:string[]) => {
 for(const key of keys){ const value=row[norm(key)]; if(value!==undefined&&value!==null&&String(value).trim()!=='') return value; }
 return undefined;
};

export const IntelligentMigrationWizard: React.FC<{onClose:()=>void}> = ({onClose}) => {
 const { products, importInventoryProducts } = useAccounting();
 const [files,setFiles]=useState<File[]>([]);
 const [rows,setRows]=useState<Row[]>([]);
 const [headers,setHeaders]=useState<string[]>([]);
 const [selected,setSelected]=useState<ModuleId[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const analysis = useMemo(()=>{
  const sources = new Map<string, Row[]>();
  rows.forEach(row=>{
   const source=String(row.migrationsource??'archivo sin nombre');
   const group=sources.get(source)??[];
   group.push(row); sources.set(source,group);
  });
  const detected: Array<ModuleInfo & {source:string; matched:string[]; missing:string[]; detected:boolean; ready:boolean}> = [];
  for(const [source, sourceRows] of sources){
   const keys=new Set(sourceRows.flatMap(row=>Object.keys(row).filter(key=>key!=='migrationsource').map(norm)));
   for(const m of MODULES){
    const matched=m.aliases.filter(a=>keys.has(norm(a)));
    const groupsByModule:Partial<Record<ModuleId,string[][]>>={
     inventory:[['code','codigo','sku','productcode'],['name','nombre','productname','producto']],
     customers:[['customername','clientename','customer','cliente','customerrif','rifcliente'],['rif','taxid','identificacion']],
     receivables:[['customername','cliente','clienterif','rifcliente'],['invoicenumber','invoice','factura','documento'],['saldo','saldoactual','monto','importe','balance','amount']],
     payables:[['suppliername','proveedor','proveedorrif','rifproveedor'],['invoicenumber','invoice','factura','documento'],['saldo','saldoactual','monto','importe','balance','amount']],
     sales:[['invoiceDate','fecha','date'],['invoiceNumber','factura','documento'],['totalAmountBs','total','totalbs','monto']],
     purchases:[['invoiceDate','fecha','date'],['invoiceNumber','factura','documento'],['totalAmountBs','total','totalbs','monto']],
     accounts:[['accountCode','codigo','code','cuenta'],['accountName','nombre','descripcion','name']],
     journal:[['fecha','date'],['accountCode','cuenta','codigocuenta'],['debitBs','debito','debe','debit'],['creditBs','credito','haber','credit']]
    };
    const groups=groupsByModule[m.id]??[m.fields];
    const matchedGroups=groups.filter(group=>group.some(key=>keys.has(norm(key)))).length;
    const specificSignals:Partial<Record<ModuleId,string[]>>={
     inventory:['sku','productcode','itemcode','existencia','currentstock'],
     customers:['customerid','customerrif','rifcliente','taxid','identificacion'],
     receivables:['customername','clienterif','rifcliente'],
     payables:['suppliername','supplierid','supplierrif','rifproveedor'],
     sales:['invoicenumber','numerofactura','customerrif'],
     purchases:['invoicenumber','numerofactura','supplierrif'],
     accounts:['accountcode','accountname','clasificacion'],
     journal:['accountcode','codigocuenta','debitbs','creditbs','debe','haber']
    };
    const hasSpecific=(specificSignals[m.id]??[]).some(key=>keys.has(norm(key)));
    if(matchedGroups<2&&!hasSpecific) continue;
    const missing=m.fields.filter(field=>!keys.has(norm(field)));
    const ready=m.id==='inventory'&&groups[0].some(k=>keys.has(norm(k)))&&groups[1].some(k=>keys.has(norm(k)))&&
     ['currentstock','existencia','stock','quantity','cantidad'].some(k=>keys.has(norm(k)))&&
     ['avgcostbs','costopromediobs','costbs','costobs','costo','costounitario','unitcost'].some(k=>keys.has(norm(k)))&&
     ['salespricebs','precioventabs','pricebs','precioventa'].some(k=>keys.has(norm(k)));
    detected.push({...m,source,matched,missing,detected:true,ready});
   }
  }
  return detected;
 },[rows]);
 const readFiles=async(list:File[])=>{
  setError('');setNotice('');setRows([]);setHeaders([]);setSelected([]);setConfirmed(false);setFiles(list);
  if(!list.length)return;
  try{
   const combined:Row[]=[]; const allHeaders = new Set<string>();
   for(const file of list){
    const ext=file.name.toLowerCase().split('.').pop();
    let parsed:Row[]=[];
    if(ext==='json'){
     const data=JSON.parse(await file.text());
     const array=Array.isArray(data)?data:Array.isArray(data.records)?data.records:Array.isArray(data.data)?data.data:Array.isArray(data.items)?data.items:Array.isArray(data.products)?data.products:null;
     if(!array) throw new Error(file.name+': el JSON debe ser un arreglo de registros o contener records, data, items o products. Los respaldos contables completos se analizan por módulo y no se importan a ciegas.');
     parsed=(array as unknown[]).filter((x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x));
    }else if(ext==='csv'||ext==='tsv'||ext==='txt'){
     parsed=parseCsv(await file.text());
    }else if(ext==='xlsx'||ext==='xlsm'){
     const wb=new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
     if(!wb.worksheets.length)throw new Error(file.name+': no contiene hojas.');
     const sheetRows: Row[] = [];
     for(const sheet of wb.worksheets){
      const matrix:unknown[][]=[];
      sheet.eachRow({includeEmpty:false},row=>{const vals:unknown[]=[];for(let c=1;c<=row.cellCount;c++)vals.push(scalar(row.getCell(c).value));matrix.push(vals);});
      const parsedSheet=toRows(matrix).map(row => ({ ...row, _migrationSource: file.name + ' — hoja: ' + sheet.name }));
      if(parsedSheet.length) sheetRows.push(...parsedSheet);
     }
     parsed=sheetRows;
    }else throw new Error(file.name+': formato no admitido. Use JSON, CSV, TSV, TXT o Excel XLSX/XLSM.');
    parsed=parsed.map(row=>{const normalized=Object.fromEntries(Object.entries(row).map(([key,value])=>[norm(key),scalar(value)])) as Row; return {...normalized, migrationsource:String(normalized.migrationsource??file.name)};});
    if(!parsed.length)throw new Error(file.name+': no se detectaron filas de datos.');
    for (const row of parsed) for (const key of Object.keys(row)) allHeaders.add(norm(key));
    combined.push(...parsed);
   }
   setRows(combined);setHeaders(Array.from(allHeaders));
   const keySet=new Set(Array.from(allHeaders));
   const detected=MODULES.filter(m=>m.aliases.filter(a=>keySet.has(norm(a))).length>=Math.min(2,m.aliases.length)).map(m=>m.id);
   const inventorySources = new Map<string, Row[]>();
   combined.forEach(row => { const source = String(row.migrationsource ?? 'archivo sin nombre'); const group = inventorySources.get(source) ?? []; group.push(row); inventorySources.set(source, group); });
   const inventoryReadyInOneSource = [...inventorySources.values()].some(sourceRows => {
    const sourceKeys = new Set(sourceRows.flatMap(row => Object.keys(row).filter(key => key !== 'migrationsource').map(norm)));
    return [['code','codigo','sku','productCode'],['name','nombre','productName','producto'],['currentStock','existencia','stock','quantity','cantidad'],['avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost'],['salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta']].every(group => group.some(key => sourceKeys.has(norm(key))));
   });
   setSelected(inventoryReadyInOneSource && detected.includes('inventory') ? ['inventory'] : []);
  }catch(e){setError(e instanceof Error?e.message:'No se pudieron leer los archivos.');}
 };
 const runMigration=()=>{
  setError('');setNotice('');
  if(!confirmed){setError('Marca la confirmación final antes de ejecutar la migración.');return;}
  const available = new Set(headers.map(norm));
  const requiredInventoryFields = [['code','codigo','sku','productCode'],['name','nombre','productName','producto'],['currentStock','existencia','stock','quantity','cantidad'],['avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost'],['salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta']];
  const missingInventoryFields = requiredInventoryFields.filter(group => !group.some(key => available.has(norm(key)))).map(group => group[0]);
  if (missingInventoryFields.length) { setError('No se puede migrar Inventario: faltan campos esenciales '+missingInventoryFields.join(', ')+'. No se supondrán existencias, costos ni precios en cero.'); return; }
  if(selected.length!==1||!selected.includes('inventory')){setError('Selecciona Inventario para ejecutar esta primera etapa. Los demás módulos quedan identificados en el plan, pero no se escribirán hasta habilitar sus importadores con validación transaccional.');return;}
  setBusy(true);
  try{
   const groupedBySource = new Map<string, Row[]>();
   rows.forEach(row => {
    const source = String(row.migrationsource ?? 'archivo sin nombre');
    const group = groupedBySource.get(source) ?? [];
    group.push(row);
    groupedBySource.set(source, group);
   });
   const inventoryRows = [...groupedBySource.entries()].filter(([, sourceRows]) => {
    const sourceKeys = new Set(sourceRows.flatMap(row => Object.keys(row).filter(key => key !== 'migrationsource')));
    return [
     ['code','codigo','sku','productcode'],
     ['name','nombre','productname','producto']
    ].every(group => group.some(key => sourceKeys.has(norm(key))));
   }).flatMap(([, sourceRows]) => sourceRows);
   if (!inventoryRows.length) throw new Error('No se identificaron archivos u hojas con encabezados de inventario (código y nombre). No se importó ningún registro.');
   const normalized=inventoryRows.map((r,i)=>({r,i}));
   const seen=new Set<string>();const existing=new Set(products.map(p=>p.code.trim().toLowerCase()));
   const prepared=normalized.map(({r,i})=>{
    const code=String(pick(r,'code','codigo','sku','productCode')??'').trim();
    const name=String(pick(r,'name','nombre','productName','producto')??'').trim();
    if(!code||!name)throw new Error('Registro '+(i+1)+': faltan código/SKU o nombre. No se importó ningún artículo.');
    const k=code.toLowerCase();
    if(seen.has(k))throw new Error('Código duplicado dentro de los archivos: '+code+'. No se importó ningún artículo.');
    if(existing.has(k))throw new Error('El código '+code+' ya existe en SICOVEN. No se sobrescriben registros automáticamente.');
    seen.add(k);
    const number=(...keys:string[])=>{const raw=pick(r,...keys); if(raw===undefined||raw===''){const essential=keys.some(key=>['currentStock','existencia','stock','quantity','cantidad','avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost','salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta'].includes(norm(key))); if(essential)throw new Error('Registro '+(i+1)+': falta el valor de '+keys[0]+'. No se asumirá cero ni se importará parcialmente.'); return 0;} const n=parseMigrationNumber(raw); if(!Number.isFinite(n)||n<0)throw new Error('Registro '+(i+1)+': valor numérico inválido en '+keys[0]+'.');return n;};
    const stock=number('currentStock','existencia','stock','quantity','cantidad');
    const cost=number('avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost');
    const priceBs=number('salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta');
    const priceUsd=number('salesPriceUsd','precioVentaUsd','priceUsd');
    return {code,name,category:String(pick(r,'category','categoria')??'General'),unit:String(pick(r,'unit','unidad')??'Unidad'),minStock:number('minStock','stockMinimo'),currentStock:stock,avgCostBs:cost,avgCostUsd:number('avgCostUsd','costoPromedioUsd'),lastCostBs:number('lastCostBs')||cost,lastCostUsd:number('lastCostUsd'),salesPriceBs:priceBs,salesPriceUsd:priceUsd,costingMethod:'PROMEDIO_PONDERADO' as const,vatTreatment:'GENERAL_16' as const,itemType:'MERCANCIA' as const,openingDate:String(pick(r,'openingDate','fechaApertura')??new Date().toISOString().slice(0,10)),openingBcvRate:pick(r,'openingBcvRate','bcvRate')===undefined?undefined:number('openingBcvRate','bcvRate')};
   });
   const count=importInventoryProducts(prepared);
   setNotice('Migración completada: '+count+' artículos incorporados. SICOVEN no sobrescribió códigos existentes. Revisa el Kardex y la valoración inicial antes de continuar.');
   setBusy(false);
  }catch(e){setError(e instanceof Error?e.message:'La validación falló. No se completó la migración.');setBusy(false);}
 };
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="migration-title">
  <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
   <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white"><div><h2 id="migration-title" className="text-lg font-bold">Asistente Inteligente de Migración</h2><p className="mt-1 text-sm text-slate-300">Multiarchivo · detección de módulos · validación antes de escribir</p></div><button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-700"><X size={20}/></button></header>
   <div className="space-y-5 overflow-y-auto p-5">
    <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-emerald-500"><FileUp size={30} className="mb-2 text-emerald-700"/><strong>Selecciona uno o varios archivos</strong><span className="mt-1 text-sm text-slate-500">JSON, CSV, TSV, TXT, XLSX o XLSM · los archivos se analizan localmente</span><input className="mt-3 block max-w-full text-sm" type="file" multiple accept=".json,.csv,.tsv,.txt,.xlsx,.xlsm" onChange={e=>void readFiles(Array.from(e.target.files||[]))}/></label>
    {files.length>0&&<p className="text-sm text-slate-600">{files.length} archivo(s) · {rows.length} registros detectados</p>}
    {analysis.length>0&&<section><h3 className="mb-2 font-bold text-slate-800">Módulos detectados automáticamente</h3><div className="grid gap-2 md:grid-cols-2">{analysis.map(m=><label key={m.id} className={'flex items-start gap-3 rounded-xl border p-3 '+(m.ready?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50')}><input type="checkbox" className="mt-1" checked={selected.includes(m.id)} disabled={!m.ready||m.id!=='inventory'} onChange={e=>setSelected(old=>e.target.checked?[...old,m.id]:old.filter(id=>id!==m.id))}/><span className="min-w-0"><span className="block font-semibold text-slate-800">{m.name}</span><span className="block text-xs text-slate-600">{m.ready?'Detectado · importador disponible':'Detectado parcialmente · requiere validar campos y dependencias'}</span>{m.missing.length>0&&<span className="block text-xs text-amber-800">Campos no detectados: {m.missing.join(', ')}</span>}</span></label>)}</div></section>}
    {rows.length>0&&<section className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center gap-2 font-semibold"><FileSpreadsheet size={17}/> Vista previa (primeros 5 registros)</div><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr>{headers.slice(0,8).map(h=><th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((r,i)=><tr key={i}>{headers.slice(0,8).map(h=><td key={h} className="max-w-40 truncate border-b p-2">{String(r[h]??'')}</td>)}</tr>)}</tbody></table></div></section>}
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><div className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck size={17}/> Controles de seguridad</div>Se rechazan códigos duplicados y campos numéricos inválidos; no se sobrescriben artículos existentes. Los módulos contables transaccionales no se importan automáticamente: requieren adaptadores con control de saldos, referencias y duplicidad documental.</div>
    {error&&<div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
    {notice&&<div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline" size={17}/>{notice}</div>}
    {rows.length>0&&<label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/><span>Confirmo que revisé los archivos y la vista previa, y autorizo la importación del módulo seleccionado. Entiendo que los códigos existentes no serán sobrescritos.</span></label>}
   </div>
   <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cerrar</button><button disabled={busy||!rows.length||!confirmed||!selected.includes('inventory')} onClick={runMigration} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy?'Validando e importando…':'Confirmar migración'}</button></footer>
  </div>
 </div>;
};
