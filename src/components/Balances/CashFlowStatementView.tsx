import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { buildCashFlowReport, CashFlowSection } from '../../types/cashFlowStatement';
import { CashFlowActivity } from '../../types/accounting';
import { formatBs, formatUsd } from '../../utils/formatters';
import { ArrowLeft, Printer, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ACTIVITY_LABELS: Record<CashFlowActivity, string> = {
  EFECTIVO_EQUIVALENTE: 'Efectivo y equivalentes',
  OPERACION: 'Actividades de operación',
  INVERSION: 'Actividades de inversión',
  FINANCIACION: 'Actividades de financiación',
  NO_MONETARIO: 'Partida no monetaria',
  SIN_CLASIFICAR: 'Sin clasificar'
};

const SECTION_LABELS: Record<CashFlowSection, string> = {
  OPERACION: 'Operación',
  INVERSION: 'Inversión',
  FINANCIACION: 'Financiación',
  SIN_CLASIFICAR: 'Sin clasificar'
};

export const CashFlowStatementView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { currentCompany, accounts, bankAccounts, journalEntries, setAccountCashFlowActivity, isStorageReady, waitForPersistence } = useAccounting();
  const availableYears = useMemo(() => {
    const years = journalEntries.filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
      .map(entry => Number(entry.date.slice(0, 4)));
    return Array.from(new Set([...years, Number(currentCompany.fiscalYear)])).filter(Number.isInteger).sort((a, b) => b - a);
  }, [journalEntries, currentCompany.fiscalYear]);
  const [year, setYear] = useState(String(availableYears[0] || currentCompany.fiscalYear));
  const [message, setMessage] = useState('');
  const report = useMemo(
    () => buildCashFlowReport(journalEntries, accounts, bankAccounts, currentCompany.id, Number(year)),
    [journalEntries, accounts, bankAccounts, currentCompany.id, year]
  );
  const money = (bs: number, usd: number) => <span className="text-right font-mono">
    <span>{formatBs(bs)}</span><span className="block text-[10px] text-slate-500">{formatUsd(usd)}</span>
  </span>;

  const handleClassify = async (code: string, value: CashFlowActivity) => {
    try {
      setAccountCashFlowActivity(code, value);
      setMessage('Guardando clasificación de la cuenta ' + code + ' en SQLite…');
      await waitForPersistence();
      setMessage('SQLite confirmó la clasificación de la cuenta ' + code + '.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar la clasificación en SQLite.');
    }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900"><Wallet className="h-5 w-5 text-emerald-600" />Estado de Flujos de Efectivo</div>
          <p className="text-sm text-slate-500">{currentCompany.name} · RIF {currentCompany.rif}</p>
          <p className="mt-1 text-xs text-slate-500">Método directo · Movimientos contabilizados de caja y bancos · Bs. y USD sin conversión cruzada.</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <button onClick={onBack} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Volver</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Printer className="h-4 w-4" />Imprimir / PDF</button>
        </div>
      </div>
      <div className="mt-4 max-w-xs">
        <label className="text-xs font-semibold text-slate-600">Ejercicio económico
          <select value={year} onChange={event => setYear(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
            {availableYears.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Efectivo inicial" bs={report.openingCashBs} usd={report.openingCashUsd} money={money} />
      <Metric title="Variación neta del período" bs={report.netChangeBs} usd={report.netChangeUsd} money={money} />
      <Metric title="Efectivo final calculado" bs={report.closingCashBs} usd={report.closingCashUsd} money={money} />
      <Metric title="Saldo final según mayor" bs={report.ledgerClosingCashBs} usd={report.ledgerClosingCashUsd} money={money} />
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4">
        <h2 className="font-bold text-slate-900">Flujos netos por actividad</h2>
        <p className="mt-1 text-xs text-slate-500">Los recibos y pagos se clasifican por la cuenta de contrapartida del asiento de caja/banco.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[850px] w-full text-xs">
          <thead className="bg-slate-100 text-slate-700"><tr>
            <th className="p-3 text-left">Actividad</th><th className="p-3 text-right">Cobros Bs.</th><th className="p-3 text-right">Pagos Bs.</th><th className="p-3 text-right">Neto Bs.</th><th className="p-3 text-right">Cobros USD</th><th className="p-3 text-right">Pagos USD</th><th className="p-3 text-right">Neto USD</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.keys(SECTION_LABELS) as CashFlowSection[]).map(section => {
              const totals = report.activities[section];
              return <tr key={section}>
                <td className="p-3 font-semibold">{SECTION_LABELS[section]}</td>
                <td className="p-3 text-right font-mono">{formatBs(totals.receiptsBs)}</td>
                <td className="p-3 text-right font-mono">{formatBs(totals.paymentsBs)}</td>
                <td className="p-3 text-right font-mono font-semibold">{formatBs(totals.netBs)}</td>
                <td className="p-3 text-right font-mono">{formatUsd(totals.receiptsUsd)}</td>
                <td className="p-3 text-right font-mono">{formatUsd(totals.paymentsUsd)}</td>
                <td className="p-3 text-right font-mono font-semibold">{formatUsd(totals.netUsd)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-4 sm:grid-cols-2">
        <Status ok={report.isReconciled} title="Conciliación de efectivo" detail={report.isReconciled
          ? 'El efectivo inicial más la variación del período coincide con el saldo final del mayor.'
          : 'Existe una diferencia entre el flujo calculado y el saldo de caja/bancos del mayor.'} />
        <Status ok={report.isFullyClassified} title="Clasificación de actividades" detail={report.isFullyClassified
          ? 'Todos los movimientos externos de efectivo están clasificados.'
          : 'Hay movimientos sin clasificar. No emita el estado como completo hasta asignar la naturaleza correcta.'} />
      </div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold text-slate-900">Clasificación de cuentas de contrapartida</h2>
      <p className="mt-1 text-xs text-slate-500">La clasificación se guarda en la ficha contable de la cuenta y se conserva localmente en SQLite. No se infiere por el nombre de la cuenta.</p>
      {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
      {!isStorageReady && <p className="mt-2 text-xs font-semibold text-rose-700">SQLite no está disponible. Las clasificaciones permanecen bloqueadas para proteger la fuente de verdad.</p>}
      <div className="mt-3 space-y-2">
        {report.classificationCandidates.map(candidate => <div key={candidate.accountCode} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-[1fr_260px]">
          <div><span className="font-mono text-xs text-slate-500">{candidate.accountCode}</span><span className="ml-2 text-sm font-medium text-slate-800">{candidate.accountName}</span></div>
          <select value={candidate.activity || 'SIN_CLASIFICAR'} onChange={event => handleClassify(candidate.accountCode, event.target.value as CashFlowActivity)} className="rounded-lg border border-slate-300 bg-white p-2 text-xs" disabled={!isStorageReady}>
            {(Object.keys(ACTIVITY_LABELS) as CashFlowActivity[]).map(activity => <option key={activity} value={activity}>{ACTIVITY_LABELS[activity]}</option>)}
          </select>
        </div>)}
        {!report.classificationCandidates.length && <p className="py-5 text-center text-xs text-slate-500">No se detectaron contrapartidas de efectivo para clasificar en este ejercicio.</p>}
      </div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b bg-slate-50 p-4"><h2 className="font-bold text-slate-900">Trazabilidad de flujos clasificados</h2></div>
      {report.lines.length ? <div className="overflow-x-auto"><table className="min-w-[850px] w-full text-xs">
        <thead className="bg-slate-100 text-slate-700"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Asiento</th><th className="p-3 text-left">Actividad</th><th className="p-3 text-left">Cuenta</th><th className="p-3 text-left">Concepto</th><th className="p-3 text-right">Cobros Bs.</th><th className="p-3 text-right">Pagos Bs.</th><th className="p-3 text-right">Cobros USD</th><th className="p-3 text-right">Pagos USD</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{report.lines.map((line, index) => <tr key={line.entryId + line.accountCode + index}>
          <td className="p-3">{line.date}</td><td className="p-3">#{line.entryNumber}</td><td className="p-3">{SECTION_LABELS[line.activity]}</td><td className="p-3 font-mono">{line.accountCode}</td><td className="p-3">{line.description}</td>
          <td className="p-3 text-right font-mono">{formatBs(line.receiptsBs)}</td><td className="p-3 text-right font-mono">{formatBs(line.paymentsBs)}</td><td className="p-3 text-right font-mono">{formatUsd(line.receiptsUsd)}</td><td className="p-3 text-right font-mono">{formatUsd(line.paymentsUsd)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="p-6 text-center text-xs text-slate-500">No hay flujos clasificados para mostrar.</p>}
    </section>

    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
      <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div>
        <p className="font-bold">Límite de alcance normativo</p>
        <p className="mt-1">Este informe presenta el método directo con base en movimientos de efectivo contabilizados y clasificación expresa de contrapartidas. El método indirecto no se presenta todavía: requiere clasificar y conciliar ajustes no monetarios, depreciaciones, provisiones y variaciones de capital de trabajo. Las transferencias internas entre cuentas de efectivo no se presentan como flujos de operación, inversión o financiación.</p>
      </div></div>
    </section>
  </div>;
};

const Metric: React.FC<{ title: string; bs: number; usd: number; money: (bs: number, usd: number) => React.ReactNode }> = ({ title, bs, usd, money }) =>
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-600">{title}</p><div className="mt-2 text-lg font-bold text-slate-900">{money(bs, usd)}</div></div>;

const Status: React.FC<{ ok: boolean; title: string; detail: string }> = ({ ok, title, detail }) =>
  <div className={'flex items-start gap-2 rounded-lg border p-3 ' + (ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950')}>
    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
    <div><p className="font-semibold">{title}</p><p className="mt-1 text-[11px]">{detail}</p></div>
  </div>;
