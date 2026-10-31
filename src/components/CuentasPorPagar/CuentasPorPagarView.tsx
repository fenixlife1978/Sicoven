import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { CreditSettlementModal } from '../shared/CreditSettlementModal';

const money=(n:number,currency='Bs.')=>`${currency} ${Number(n||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const settlementMethodLabel=(method:string)=>(({CASH_BS:'Efectivo Bs.',CASH_USD:'Efectivo USD',BANK_TRANSFER_BS:'Transferencia Bs.',BANK_TRANSFER_USD:'Transferencia USD',OTHER:'Otro'} as Record<string,string>)[method]||method);
const today=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;};

export const CuentasPorPagarView: React.FC = () => {
 const { purchases, creditSettlements, getCreditBalance, currentCompany, accounts, bankAccounts, supplierDirectAdvances, supplierAdvanceSettlements, addSupplierDirectAdvance, getSupplierAdvanceBalance, addSupplierAdvanceSettlement }=useAccounting();
 const [settlementSupplierRif,setSettlementSupplierRif]=useState('');
 const [settlementKind,setSettlementKind]=useState<'REFUND_RECEIVED'|'APPLIED_TO_PURCHASE'>('APPLIED_TO_PURCHASE');
 const [settlementDate,setSettlementDate]=useState(today());
 const [settlementUsd,setSettlementUsd]=useState('');
 const [settlementRate,setSettlementRate]=useState(String(currentCompany.bcvRate||''));
 const [settlementBankCode,setSettlementBankCode]=useState('');
 const [settlementTargetId,setSettlementTargetId]=useState('');
 const [settlementCashBs,setSettlementCashBs]=useState('');
 const [settlementReference,setSettlementReference]=useState('');
 const [settlementMessage,setSettlementMessage]=useState('');
 const [settlementSaving,setSettlementSaving]=useState(false);
 const supplierChoices=useMemo(()=>{
  const map=new Map<string,string>();
  purchases.filter(p=>p.companyId===currentCompany.id&&!p.isCancelled).forEach(p=>map.set(String(p.supplierRif).trim().toUpperCase(),p.supplierName));
  supplierDirectAdvances.filter(a=>a.companyId===currentCompany.id&&!a.isReversed).forEach(a=>map.set(String(a.supplierRif).trim().toUpperCase(),a.supplierName));
  return [...map.entries()].map(([rif,name])=>({rif,name}));
 },[purchases,supplierDirectAdvances,currentCompany.id]);
 const settlementBalance=settlementSupplierRif?getSupplierAdvanceBalance(settlementSupplierRif):null;
 const settlementTargets=purchases.filter(p=>p.companyId===currentCompany.id&&!p.isCancelled&&p.documentType==='01'&&p.paymentTerm==='CREDITO'&&String(p.supplierRif||'').trim().toUpperCase()===settlementSupplierRif&&getCreditBalance(p.id,'PURCHASE_PAYMENT').outstandingUsd>0.005);
 const refundBanks=accounts.filter(a=>a.type==='ACTIVO'&&a.isMovement&&(a.code==='1.1.1.01'||bankAccounts.some(b=>b.companyId===currentCompany.id&&b.accountCode===a.code&&b.currency==='BS')));
 const submitAdvanceSettlement=async(e:React.FormEvent)=>{
  e.preventDefault();if(settlementSaving)return;setSettlementSaving(true);setSettlementMessage('');
  try{
   const amountUsd=Number(settlementUsd);const bcvRate=Number(settlementRate);
   const amountBs=Math.round(amountUsd*bcvRate*100)/100;
   if(settlementKind==='REFUND_RECEIVED'&&!settlementReference.trim())throw new Error('La referencia del reembolso es obligatoria.');
   const bank=refundBanks.find(a=>a.code===settlementBankCode);
   if(settlementKind==='REFUND_RECEIVED'&&!bank)throw new Error('Seleccione una cuenta real de Caja/Banco en Bs. para recibir el reembolso.');
   const cashReceivedBs=settlementKind==='REFUND_RECEIVED'?Number(settlementCashBs||amountBs):undefined;
   await addSupplierAdvanceSettlement({
    supplierRif:settlementSupplierRif,kind:settlementKind,date:settlementDate,amountUsd,amountBs,
    cashReceivedBs,bcvRate,treasuryAccountCode:settlementKind==='REFUND_RECEIVED'?settlementBankCode:undefined,
    targetPurchaseId:settlementKind==='APPLIED_TO_PURCHASE'?settlementTargetId:undefined,
    reference:settlementReference
   });
   setSettlementMessage(settlementKind==='REFUND_RECEIVED'?'Reembolso registrado y confirmado en SQLite.':'Anticipo aplicado a la factura y asiento confirmado en SQLite.');
   setSettlementUsd('');setSettlementCashBs('');setSettlementReference('');setSettlementTargetId('');
  }catch(error){setSettlementMessage(error instanceof Error?error.message:'No se pudo liquidar el anticipo.');}
  finally{setSettlementSaving(false);}
 };
 const [advanceSupplierName,setAdvanceSupplierName]=useState('');
 const [advanceSupplierRif,setAdvanceSupplierRif]=useState('');
 const [advanceDate,setAdvanceDate]=useState(today());
 const [advanceUsd,setAdvanceUsd]=useState('');
 const [advanceRate,setAdvanceRate]=useState(String(currentCompany.bcvRate||''));
 const [advanceAccount,setAdvanceAccount]=useState('1.1.1.01');
 const [advanceCurrency,setAdvanceCurrency]=useState<'BS'|'USD'>('BS');
 const [advanceReference,setAdvanceReference]=useState('');
 const [advanceSupport,setAdvanceSupport]=useState('');
 const [advanceMessage,setAdvanceMessage]=useState('');
 const [advanceSaving,setAdvanceSaving]=useState(false);
 const treasuryAccounts=accounts.filter(a=>a.type==='ACTIVO'&&a.isMovement&&a.code.startsWith('1.1.1.'));
 const directAdvanceRows=supplierDirectAdvances.filter(a=>a.companyId===currentCompany.id)
  .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
 const submitDirectAdvance=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(advanceSaving)return;
  setAdvanceSaving(true);setAdvanceMessage('');
  try{
   const amountUsd=Number(advanceUsd);const bcvRate=Number(advanceRate);
   const bank=bankAccounts.find(b=>b.accountCode===advanceAccount);
   const expectedCurrency=bank?.currency||(advanceAccount==='1.1.1.02'?'USD':'BS');
   if(expectedCurrency!==advanceCurrency)throw new Error('La moneda del desembolso no coincide con la moneda de la cuenta de Caja/Banco.');
   const paidAmount=advanceCurrency==='USD'?amountUsd:Math.round(amountUsd*bcvRate*100)/100;
   await addSupplierDirectAdvance({
    supplierName:advanceSupplierName,supplierRif:advanceSupplierRif,date:advanceDate,
    amountUsd,bcvRate,treasuryAccountCode:advanceAccount,paymentCurrency:advanceCurrency,
    paidAmount,reference:advanceReference,support:advanceSupport||undefined
   });
   setAdvanceMessage('Anticipo registrado y asiento contable confirmado en SQLite.');
   setAdvanceSupplierName('');setAdvanceSupplierRif('');setAdvanceUsd('');setAdvanceReference('');setAdvanceSupport('');
  }catch(error){setAdvanceMessage(error instanceof Error?error.message:'No se pudo registrar el anticipo.');}
  finally{setAdvanceSaving(false);}
 };
 const [query,setQuery]=useState('');
 const [historyFor,setHistoryFor]=useState<string|null>(null);
 const [selected,setSelected]=useState<(typeof purchases)[number]|null>(null);
 const rows=useMemo(()=>purchases.filter(p=>p.companyId===currentCompany.id).filter(p=>!p.isCancelled).filter(p=>p.documentType==='01').filter(p=>p.paymentTerm==='CREDITO').filter(p=>{
  const q=query.trim().toLowerCase();
  return !q || [p.supplierName,p.supplierRif,p.invoiceNumber,p.controlNumber].some(v=>String(v||'').toLowerCase().includes(q));
 }).map(p=>({p,b:getCreditBalance(p.id,'PURCHASE_PAYMENT')})).sort((a,b)=>String(a.p.dueDate||'9999').localeCompare(String(b.p.dueDate||'9999'))),[purchases,query,getCreditBalance,currentCompany.id]);
 const open=rows.filter(r=>r.b.outstandingUsd>0.005);
 const overdue=open.filter(r=>r.p.dueDate && r.p.dueDate<today());
 const total=open.reduce((s,r)=>s+r.b.outstandingUsd,0);
 return <section className="space-y-5">
  <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Tesorería · Proveedores</p><h1 className="text-2xl font-bold text-slate-900">Cuentas por pagar (CxP)</h1><p className="text-sm text-slate-500">Facturas de compra marcadas a crédito; los abonos quedan vinculados al documento original.</p></div><input aria-label="Buscar proveedor o factura" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar proveedor, RIF o factura…" className="w-full sm:max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"/></header>
  <form onSubmit={submitDirectAdvance} className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
   <div><h2 className="font-bold text-slate-900">Registrar anticipo directo a proveedor</h2><p className="text-xs text-slate-600">Desembolso real desde Caja/Banco, sin crear una factura ficticia ni una cuenta por pagar.</p></div>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-xs font-semibold text-slate-700">Razón social<input required value={advanceSupplierName} onChange={e=>setAdvanceSupplierName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">RIF proveedor<input required value={advanceSupplierRif} onChange={e=>setAdvanceSupplierRif(e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Fecha efectiva<input required type="date" value={advanceDate} onChange={e=>setAdvanceDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Anticipo USD<input required type="number" min="0.01" step="0.000001" value={advanceUsd} onChange={e=>setAdvanceUsd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Tasa BCV<input required type="number" min="0.000001" step="0.000001" value={advanceRate} onChange={e=>setAdvanceRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Cuenta Caja/Banco<select required value={advanceAccount} onChange={e=>setAdvanceAccount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{treasuryAccounts.map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-700">Moneda desembolsada<select value={advanceCurrency} onChange={e=>setAdvanceCurrency(e.target.value as 'BS'|'USD')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="BS">Bolívares</option><option value="USD">Dólares</option></select></label>
    <label className="text-xs font-semibold text-slate-700">Referencia / operación<input required value={advanceReference} onChange={e=>setAdvanceReference(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Soporte / comprobante<input required value={advanceSupport} onChange={e=>setAdvanceSupport(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Ruta o referencia documental"/></label>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">Asiento: Debe 1.1.2.03 Anticipos a proveedores / Haber cuenta seleccionada de Caja/Banco.</p><button disabled={advanceSaving} className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{advanceSaving?'Registrando…':'Registrar anticipo'}</button></div>
   {advanceMessage&&<p role="status" className="rounded-lg bg-white p-3 text-xs text-slate-700">{advanceMessage}</p>}
  </form>
  <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><h2 className="font-bold text-slate-900">Anticipos directos registrados</h2><p className="text-xs text-slate-500">Desembolsos originales y sus asientos; no son notas de crédito.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Fecha</th><th className="p-3">Proveedor / RIF</th><th className="p-3">Referencia</th><th className="p-3">Desembolso</th><th className="p-3">Valor en libros</th><th className="p-3">Cuenta</th><th className="p-3">Asiento</th></tr></thead><tbody>{directAdvanceRows.map(a=><tr key={a.id} className="border-t"><td className="p-3">{a.date}</td><td className="p-3"><strong>{a.supplierName}</strong><span className="block text-slate-500">{a.supplierRif}</span></td><td className="p-3">{a.reference}</td><td className="p-3">{a.paymentCurrency==='USD'?'USD ':'Bs. '}{Number(a.paidAmount).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td className="p-3">{money(a.bookValueBs)}<span className="block text-slate-500">{money(a.amountUsd,'USD')}</span></td><td className="p-3">{a.treasuryAccountCode}</td><td className="p-3 font-mono">{a.journalEntryId}</td></tr>)}</tbody></table>{directAdvanceRows.length===0&&<p className="p-6 text-center text-xs text-slate-500">Todavía no hay anticipos directos registrados.</p>}</div></section>
  <form onSubmit={submitAdvanceSettlement} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
   <div><h2 className="font-bold text-slate-900">Aplicar o recuperar anticipos</h2><p className="text-xs text-slate-600">Permite aplicar el saldo a una factura posterior del mismo proveedor o registrar un reembolso recibido. El sistema descarga el valor histórico FIFO.</p></div>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-xs font-semibold text-slate-700">Proveedor<select required value={settlementSupplierRif} onChange={e=>{setSettlementSupplierRif(e.target.value);setSettlementTargetId('');}} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Seleccione proveedor</option>{supplierChoices.map(s=><option key={s.rif} value={s.rif}>{s.name} · {s.rif}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-700">Operación<select value={settlementKind} onChange={e=>setSettlementKind(e.target.value as 'REFUND_RECEIVED'|'APPLIED_TO_PURCHASE')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="APPLIED_TO_PURCHASE">Aplicar a factura</option><option value="REFUND_RECEIVED">Reembolso recibido</option></select></label>
    <label className="text-xs font-semibold text-slate-700">Fecha efectiva<input required type="date" value={settlementDate} onChange={e=>setSettlementDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Importe a liquidar USD<input required type="number" min="0.01" step="0.000001" max={settlementBalance?.outstandingUsd||undefined} value={settlementUsd} onChange={e=>setSettlementUsd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    <label className="text-xs font-semibold text-slate-700">Tasa BCV de la operación<input required type="number" min="0.000001" step="0.000001" value={settlementRate} onChange={e=>setSettlementRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    {settlementKind==='APPLIED_TO_PURCHASE'?<label className="text-xs font-semibold text-slate-700 lg:col-span-2">Factura destino<select required value={settlementTargetId} onChange={e=>setSettlementTargetId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Seleccione factura de crédito pendiente</option>{settlementTargets.map(p=><option key={p.id} value={p.id}>{p.invoiceNumber} · {p.supplierName} · {money(getCreditBalance(p.id,'PURCHASE_PAYMENT').outstandingUsd,'USD')} pendiente</option>)}</select></label>:<><label className="text-xs font-semibold text-slate-700">Cuenta bancaria receptora<select required value={settlementBankCode} onChange={e=>setSettlementBankCode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Seleccione cuenta en Bs.</option>{refundBanks.map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">Bs. efectivamente recibidos<input required type="number" min="0.01" step="0.01" value={settlementCashBs} onChange={e=>setSettlementCashBs(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label></>}
    <label className="text-xs font-semibold text-slate-700">Referencia / soporte<input required value={settlementReference} onChange={e=>setSettlementReference(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">Saldo disponible: {money(settlementBalance?.outstandingUsd||0,'USD')} · {money(settlementBalance?.outstandingBs||0)}</p><button disabled={settlementSaving||!settlementBalance||settlementBalance.outstandingUsd<=0} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{settlementSaving?'Procesando…':'Confirmar liquidación'}</button></div>
   {settlementMessage&&<p role="status" className="rounded-lg bg-white p-3 text-xs text-slate-700">{settlementMessage}</p>}
  </form>
  <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><h2 className="font-bold text-slate-900">Historial de aplicaciones y reembolsos de anticipos</h2><p className="text-xs text-slate-500">Trazabilidad de cada liquidación, asiento y estado de reversión.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Fecha</th><th className="p-3">Proveedor / RIF</th><th className="p-3">Operación</th><th className="p-3">Factura destino</th><th className="p-3">USD</th><th className="p-3">Valor en libros Bs.</th><th className="p-3">Referencia</th><th className="p-3">Asiento</th><th className="p-3">Estado</th></tr></thead><tbody>{supplierAdvanceSettlements.filter(s=>s.companyId===currentCompany.id).sort((a,b)=>b.date.localeCompare(a.date)).map(s=><tr key={s.id} className="border-t"><td className="p-3">{s.date}</td><td className="p-3">{s.supplierName}<span className="block text-slate-500">{s.supplierRif}</span></td><td className="p-3">{s.kind==='REFUND_RECEIVED'?'Reembolso recibido':'Aplicación a CxP'}</td><td className="p-3">{s.targetPurchaseId?(purchases.find(p=>p.id===s.targetPurchaseId)?.invoiceNumber||s.targetPurchaseId):'—'}</td><td className="p-3">{money(s.amountUsd,'USD')}</td><td className="p-3">{money(s.advanceBookValueBs??s.amountBs)}</td><td className="p-3">{s.reference||'—'}</td><td className="p-3 font-mono">{s.journalEntryId}</td><td className="p-3">{s.isReversed?'Reversado':'Activo'}</td></tr>)}</tbody></table>{supplierAdvanceSettlements.length===0&&<p className="p-6 text-center text-xs text-slate-500">Sin aplicaciones ni reembolsos registrados.</p>}</div></section>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><article className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Saldo pendiente USD</p><p className="text-2xl font-bold">{money(total,'USD')}</p></article><article className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Facturas pendientes</p><p className="text-2xl font-bold">{open.length}</p></article><article className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Vencidas</p><p className="text-2xl font-bold text-rose-700">{overdue.length}</p></article></div>
  <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Vencimiento</th><th className="p-3">Proveedor</th><th className="p-3">Factura</th><th className="p-3">Neto por pagar USD</th><th className="p-3">Abonado USD</th><th className="p-3">Notas de crédito USD</th><th className="p-3">Anticipos aplicados USD</th><th className="p-3">Saldo USD</th><th className="p-3">Acción</th></tr></thead><tbody>{rows.map(({p,b})=><tr key={p.id} className="border-t"><td className="p-3">{p.dueDate||'—'}{p.dueDate&&p.dueDate<today()&&b.outstandingUsd>0.005?<span className="ml-2 rounded bg-rose-100 px-2 py-1 text-xs text-rose-700">Vencida</span>:null}</td><td className="p-3"><div className="font-semibold">{p.supplierName}</div><div className="text-xs text-slate-500">{p.supplierRif}</div></td><td className="p-3">{p.invoiceNumber||'—'}</td><td className="p-3">{money(b.originalAmountUsd,'USD')}</td><td className="p-3">{money(b.settledAmountUsd,'USD')}</td><td className="p-3">{money(b.creditedByNotesUsd||0,'USD')}</td><td className="p-3">{money(b.creditedBySupplierAdvancesUsd||0,'USD')}</td><td className="p-3 font-bold">{money(b.outstandingUsd,'USD')}</td><td className="p-3"><div className="flex flex-wrap gap-2">{b.outstandingUsd>0.005?<button onClick={()=>setSelected(p)} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800">Registrar pago</button>:<span className="text-xs text-emerald-700">Pagada</span>}<button type="button" onClick={()=>setHistoryFor(historyFor===p.id?null:p.id)} className="rounded-lg border px-3 py-2 text-xs font-semibold">{historyFor===p.id?'Ocultar historial':'Historial'} ({creditSettlements.filter(s=>s.companyId===currentCompany.id&&s.documentId===p.id&&s.kind==='PURCHASE_PAYMENT').length})</button></div></td></tr>)}{historyFor && rows.some(({p})=>p.id===historyFor) && <tr className="border-t bg-slate-50"><td colSpan={9} className="p-3"><h3 className="mb-2 font-semibold text-slate-800">Historial de pagos · {rows.find(({p})=>p.id===historyFor)?.p.invoiceNumber||'Factura'}</h3><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="text-slate-500"><th className="p-2">Fecha</th><th className="p-2">USD</th><th className="p-2">Bs.</th><th className="p-2">Tasa BCV</th><th className="p-2">Medio</th><th className="p-2">Referencia</th><th className="p-2">Asiento</th><th className="p-2">Ajuste fiscal propuesto</th></tr></thead><tbody>{creditSettlements.filter(s=>s.companyId===currentCompany.id&&s.documentId===historyFor&&s.kind==='PURCHASE_PAYMENT').sort((a,b)=>a.settlementDate.localeCompare(b.settlementDate)).map(s=><tr key={s.id} className="border-t"><td className="p-2">{s.settlementDate}</td><td className="p-2">{money(s.amountUsd,'USD')}</td><td className="p-2">{money(s.amountBs)}</td><td className="p-2">{Number(s.bcvRate).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:6})}</td><td className="p-2">{settlementMethodLabel(s.method)}</td><td className="p-2">{s.reference||'—'}</td><td className="p-2">{s.journalEntryId}</td><td className="p-2"><div className="font-semibold">{s.fxFiscalAdjustmentProposal?.direction==='REVIEW_REQUIRED'?'Revisión contable':s.fxFiscalAdjustmentProposal?.direction==='DEBIT_NOTE'?'Evaluar nota de débito':s.fxFiscalAdjustmentProposal?.direction==='CREDIT_NOTE'?'Evaluar nota de crédito':'Sin ajuste material'}</div>{s.fxFiscalAdjustmentProposal&&<div className="mt-1 space-y-0.5 text-[11px] text-slate-500"><div>Base: {money(s.fxFiscalAdjustmentProposal.deltaBaseBs)}</div><div>IVA: {money(s.fxFiscalAdjustmentProposal.deltaVatBs)}</div><div>Total: {money(s.fxFiscalAdjustmentProposal.deltaTotalBs)}</div></div>}</td></tr>)}</tbody></table></div>{creditSettlements.filter(s=>s.companyId===currentCompany.id&&s.documentId===historyFor&&s.kind==='PURCHASE_PAYMENT').length===0&&<p className="py-3 text-xs text-slate-500">Todavía no hay pagos registrados para esta factura.</p>}{purchases.filter(note=>note.companyId===currentCompany.id&&note.originalPurchaseId===historyFor&&note.documentType==='03').length>0&&<div className="mt-4 border-t pt-3"><h4 className="mb-2 font-semibold text-slate-800">Notas de crédito aplicadas</h4><div className="space-y-2">{purchases.filter(note=>note.companyId===currentCompany.id&&note.originalPurchaseId===historyFor&&note.documentType==='03').map(note=><div key={note.id} className="flex flex-wrap justify-between gap-2 rounded-lg border bg-white p-2"><span><strong>{note.creditNoteNumber||note.invoiceNumber}</strong> · {note.invoiceDate}<span className="block text-xs text-slate-500">{note.notes||'Devolución de mercancía'}</span></span><span className="text-right"><strong>{money(note.netPayableReductionUsd||0,'USD')}</strong><span className="block text-xs text-slate-500">Asiento {note.journalEntryId}</span></span></div>)}</div></div>}</td></tr>}{/* historial de operaciones de crédito */}</tbody></table>{rows.length===0&&<p className="p-8 text-center text-sm text-slate-500">No hay facturas a crédito que coincidan. Registra la condición de pago como Crédito en el documento de compra.</p>}</div>
  <p className="text-xs text-slate-500">Empresa activa: {currentCompany.name}. El saldo se calcula en USD y su equivalente en Bs se valora a la tasa original de la factura. La diferencia cambiaria se propone para revisión contable; no emite notas fiscales automáticamente.</p>
  {selected&&<CreditSettlementModal documentId={selected.id} documentNumber={selected.invoiceNumber} partyName={selected.supplierName} kind="PURCHASE_PAYMENT" onClose={()=>setSelected(null)}/>}
 </section>;
};
