import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { formatBs, formatUsd } from '../../utils/formatters';
import { selectHistoricalReportEntries } from '../../types/accountingReportIntegrity';
import { History, ArrowLeftRight, Printer } from 'lucide-react';

type ReportKind = 'SITUACION' | 'RESULTADOS';

export const HistoricalBalancesView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { currentCompany, accounts, journalEntries, displayCurrency } = useAccounting();
  const years = useMemo(() => Array.from(new Set(journalEntries
    .filter(e => e.companyId === currentCompany.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map(e => Number(e.date.slice(0, 4)))).values()).sort((a,b) => b-a), [journalEntries, currentCompany.id]);
  const fallbackYear = Number(currentCompany.fiscalYear) || new Date().getFullYear();
  const [yearFrom, setYearFrom] = useState(String(years.includes(fallbackYear) ? fallbackYear : (years[0] ?? fallbackYear)));
  const [yearTo, setYearTo] = useState(String(years.find(y => y < Number(yearFrom)) ?? years[1] ?? years[0] ?? fallbackYear));
  const [kind, setKind] = useState<ReportKind>('SITUACION');

  const selectedYears = useMemo(() => {
    const start = Number(yearFrom), end = Number(yearTo);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const low = Math.min(start, end), high = Math.max(start, end);
    return Array.from(new Set([...years, fallbackYear])).filter(y => y >= low && y <= high).sort((a,b) => a-b);
  }, [yearFrom, yearTo, years, fallbackYear]);

  const summaries = useMemo(() => selectedYears.map(year => {
    const entries = selectHistoricalReportEntries(journalEntries, currentCompany.id, year, kind);
    const rows = accounts.map(account => {
      let debitBs=0, creditBs=0, debitUsd=0, creditUsd=0;
      for (const entry of entries) for (const item of entry.items) if (item.accountCode === account.code) {
        debitBs += Number(item.debitBs || 0); creditBs += Number(item.creditBs || 0);
        debitUsd += Number(item.debitUsd || 0); creditUsd += Number(item.creditUsd || 0);
      }
      const balanceBs = kind === 'SITUACION'
        ? (account.type === 'ACTIVO' ? debitBs-creditBs : ['PASIVO','PATRIMONIO'].includes(account.type) ? creditBs-debitBs : 0)
        : (account.type === 'INGRESOS' ? creditBs-debitBs : ['COSTOS','GASTOS'].includes(account.type) ? debitBs-creditBs : 0);
      const balanceUsd = kind === 'SITUACION'
        ? (account.type === 'ACTIVO' ? debitUsd-creditUsd : ['PASIVO','PATRIMONIO'].includes(account.type) ? creditUsd-debitUsd : 0)
        : (account.type === 'INGRESOS' ? creditUsd-debitUsd : ['COSTOS','GASTOS'].includes(account.type) ? debitUsd-creditUsd : 0);
      return { ...account, debitBs, creditBs, debitUsd, creditUsd, balanceBs, balanceUsd };
    }).filter(row => Math.abs(row.balanceBs) > 0.004 || Math.abs(row.balanceUsd) > 0.004);
    const totalActivoBs = rows.filter(r=>r.type==='ACTIVO').reduce((s,r)=>s+r.balanceBs,0);
    const totalPasivoBs = rows.filter(r=>r.type==='PASIVO').reduce((s,r)=>s+r.balanceBs,0);
    const patrimonioBaseBs = rows.filter(r=>r.type==='PATRIMONIO').reduce((s,r)=>s+r.balanceBs,0);
    const ingresosBs = rows.filter(r=>r.type==='INGRESOS').reduce((s,r)=>s+r.balanceBs,0);
    const costosBs = rows.filter(r=>r.type==='COSTOS').reduce((s,r)=>s+r.balanceBs,0);
    const gastosBs = rows.filter(r=>r.type==='GASTOS').reduce((s,r)=>s+r.balanceBs,0);
    const totalActivoUsd = rows.filter(r=>r.type==='ACTIVO').reduce((s,r)=>s+r.balanceUsd,0);
    const totalPasivoUsd = rows.filter(r=>r.type==='PASIVO').reduce((s,r)=>s+r.balanceUsd,0);
    const patrimonioBaseUsd = rows.filter(r=>r.type==='PATRIMONIO').reduce((s,r)=>s+r.balanceUsd,0);
    const ingresosUsd = rows.filter(r=>r.type==='INGRESOS').reduce((s,r)=>s+r.balanceUsd,0);
    const costosUsd = rows.filter(r=>r.type==='COSTOS').reduce((s,r)=>s+r.balanceUsd,0);
    const gastosUsd = rows.filter(r=>r.type==='GASTOS').reduce((s,r)=>s+r.balanceUsd,0);
    const resultadoBs = ingresosBs-costosBs-gastosBs;
    const resultadoUsd = ingresosUsd-costosUsd-gastosUsd;
    return { year, rows, count: entries.length, totalActivoBs, totalPasivoBs,
      totalPatrimonioBs: patrimonioBaseBs + resultadoBs, patrimonioBaseBs,
      resultadoBs, totalActivoUsd, totalPasivoUsd,
      totalPatrimonioUsd: patrimonioBaseUsd + resultadoUsd, patrimonioBaseUsd,
      resultadoUsd };
  }), [selectedYears, journalEntries, currentCompany.id, accounts, kind]);

  const money = (bs:number, usd:number) => <>{displayCurrency !== 'USD' && formatBs(bs)}{displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-500">{formatUsd(usd)}</div>}{displayCurrency === 'USD' && formatUsd(usd)}</>;
  return <div className="space-y-5">
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-slate-900 font-bold text-lg"><History className="w-5 h-5 text-emerald-600"/>Balances históricos</div>
        <p className="text-sm text-slate-500 mt-1">{currentCompany.name} · Comparación por ejercicio a partir de los asientos guardados en SICOVEN.</p></div>
        <div className="flex gap-2 no-print"><button onClick={onBack} className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">Volver a balances</button><button onClick={()=>window.print()} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm flex gap-2 items-center"><Printer className="w-4 h-4"/>Imprimir</button></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        <label className="text-xs font-semibold text-slate-600">Desde ejercicio
          <select value={yearFrom} onChange={e=>setYearFrom(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">{Array.from(new Set([...years,fallbackYear])).sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Hasta ejercicio
          <select value={yearTo} onChange={e=>setYearTo(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">{Array.from(new Set([...years,fallbackYear])).sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Tipo de balance
          <select value={kind} onChange={e=>setKind(e.target.value as ReportKind)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"><option value="SITUACION">Balance de situación patrimonial</option><option value="RESULTADOS">Estado de resultados</option></select>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ArrowLeftRight className="w-4 h-4"/>Los ejercicios se calculan con los asientos de la empresa activa; no se crean ni alteran registros contables.</div>
    </div>
    {summaries.length === 0 ? <div className="bg-white rounded-xl border p-8 text-center text-slate-500">No hay ejercicios dentro del filtro seleccionado.</div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaries.map(s=><div key={s.year} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"><div className="text-xs text-slate-500 uppercase font-bold">Ejercicio {s.year}</div><div className="mt-2 text-xs text-slate-500">{s.count} asientos considerados</div>
          {kind==='SITUACION' ? <><div className="mt-4 flex justify-between gap-3 text-sm"><span>Activo</span><strong>{money(s.totalActivoBs,s.totalActivoUsd)}</strong></div><div className="mt-2 flex justify-between gap-3 text-sm"><span>Pasivo</span><strong>{money(s.totalPasivoBs,s.totalPasivoUsd)}</strong></div><div className="mt-2 flex justify-between gap-3 text-sm"><span>Resultado acumulado / del ejercicio</span><strong>{money(s.resultadoBs,s.resultadoUsd)}</strong></div><div className="mt-2 flex justify-between gap-3 text-sm"><span>Patrimonio + resultado</span><strong>{money(s.totalPatrimonioBs,s.totalPatrimonioUsd)}</strong></div></> : <div className="mt-4 flex justify-between gap-3 text-sm"><span>Resultado neto</span><strong className={s.resultadoBs>=0?'text-emerald-700':'text-rose-700'}>{money(s.resultadoBs,s.resultadoUsd)}</strong></div>}
        </div>)}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b font-bold text-sm">Detalle comparativo por cuenta</div>
        <div className="overflow-x-auto"><table className="w-full text-xs min-w-[640px]"><thead className="bg-slate-100 text-slate-700"><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Cuenta</th>{summaries.map(s=><th key={s.year} className="p-3 text-right">{s.year}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{accounts.filter(a=>summaries.some(s=>s.rows.some(r=>r.code===a.code))).map(a=><tr key={a.code}><td className="p-3 font-mono">{a.code}</td><td className="p-3">{a.name}</td>{summaries.map(s=>{const row=s.rows.find(r=>r.code===a.code);return <td key={s.year} className="p-3 text-right font-mono">{row?money(row.balanceBs,row.balanceUsd):'—'}</td>})}</tr>)}{kind==='SITUACION' && <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold"><td className="p-3 font-mono">—</td><td className="p-3">Resultado acumulado / del ejercicio</td>{summaries.map(s=><td key={s.year} className="p-3 text-right font-mono">{money(s.resultadoBs,s.resultadoUsd)}</td>)}</tr>}</tbody>
        </table></div>
      </div>
    </>}
  </div>;
};
