import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { formatBs, formatUsd } from '../../utils/formatters';
import { buildEquityChangesReport } from '../../types/equityChanges';
import { buildDisclosureAccountMovements, type FinancialDisclosureKind } from '../../types/financialDisclosures';
import { ArrowLeft, Download, FileSpreadsheet, Printer, ShieldAlert, TrendingUp } from 'lucide-react';

type AnnualAccountRow = {
  code: string;
  name: string;
  type: string;
  debitBs: number;
  creditBs: number;
  debitUsd: number;
  creditUsd: number;
  netBs: number;
  netUsd: number;
};

export const AnnualReportsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { currentCompany, accounts, journalEntries, displayCurrency, financialDisclosures, saveFinancialDisclosure } = useAccounting();
  const availableYears = useMemo(() => {
    const years = journalEntries
      .filter(e => e.companyId === currentCompany.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map(e => Number(e.date.slice(0, 4)));
    return Array.from(new Set([...years, Number(currentCompany.fiscalYear) || new Date().getFullYear()])).sort((a, b) => b - a);
  }, [journalEntries, currentCompany.id, currentCompany.fiscalYear]);
  const [year, setYear] = useState(String(availableYears[0] ?? new Date().getFullYear()));
  const [showClosingChecklist, setShowClosingChecklist] = useState(false);
  const [disclosureTitle, setDisclosureTitle] = useState('');
  const [disclosureBody, setDisclosureBody] = useState('');
  const [disclosureKind, setDisclosureKind] = useState<FinancialDisclosureKind>('ACCOUNTING_POLICY');
  const [disclosureAccounts, setDisclosureAccounts] = useState('');
  const [disclosureEntries, setDisclosureEntries] = useState('');
  const [disclosureStatus, setDisclosureStatus] = useState<'DRAFT' | 'REVIEWED'>('DRAFT');
  const [disclosureError, setDisclosureError] = useState('');
  const [disclosureSaving, setDisclosureSaving] = useState(false);
  const yearDisclosures = useMemo(
    () => financialDisclosures.filter(note => note.fiscalYear === Number(year)).sort((a, b) => a.noteNumber - b.noteNumber),
    [financialDisclosures, year]
  );
  const disclosureMovements = useMemo(
    () => buildDisclosureAccountMovements(journalEntries, accounts, currentCompany.id, Number(year)),
    [journalEntries, accounts, currentCompany.id, year]
  );
  const saveDisclosure = async () => {
    setDisclosureError('');
    setDisclosureSaving(true);
    try {
      const sourceAccountCodes = [...new Set(disclosureAccounts.split(',').map(value => value.trim()).filter(Boolean))];
      const sourceEntryIds = [...new Set(disclosureEntries.split(',').map(value => value.trim()).filter(Boolean))];
      const unknownAccounts = sourceAccountCodes.filter(code => !accounts.some(account => account.code === code));
      const invalidEntries = sourceEntryIds.filter(id => !journalEntries.some(entry => entry.id === id && entry.companyId === currentCompany.id && entry.date >= year + '-01-01' && entry.date <= year + '-12-31' && entry.type !== 'CIERRE'));
      if (unknownAccounts.length) throw new Error('Cuentas fuente inexistentes: ' + unknownAccounts.join(', '));
      if (invalidEntries.length) throw new Error('Asientos fuente inexistentes, de otra empresa o fuera del ejercicio: ' + invalidEntries.join(', '));
      const nextNumber = Math.max(0, ...yearDisclosures.map(note => note.noteNumber)) + 1;
      await saveFinancialDisclosure({
        fiscalYear: Number(year), noteNumber: nextNumber, title: disclosureTitle.trim(),
        kind: disclosureKind, body: disclosureBody.trim(), status: disclosureStatus,
        sourceAccountCodes,
        sourceEntryIds
      });
      setDisclosureTitle(''); setDisclosureBody(''); setDisclosureAccounts(''); setDisclosureEntries('');
    } catch (error) {
      setDisclosureError(error instanceof Error ? error.message : 'No fue posible guardar la nota.');
    } finally { setDisclosureSaving(false); }
  };


  const report = useMemo(() => {
    const fiscalEntries = journalEntries.filter(e =>
      e.companyId === currentCompany.id &&
      e.date >= year + '-01-01' &&
      e.date <= year + '-12-31' &&
      e.type !== 'CIERRE'
    );
    const rows: AnnualAccountRow[] = accounts
      .filter(a => a.isMovement && ['INGRESOS', 'COSTOS', 'GASTOS', 'PASIVO', 'PATRIMONIO'].includes(a.type))
      .map(account => {
        let debitBs = 0, creditBs = 0, debitUsd = 0, creditUsd = 0;
        for (const entry of fiscalEntries) for (const item of entry.items) {
          if (item.accountCode !== account.code) continue;
          debitBs += Number(item.debitBs || 0);
          creditBs += Number(item.creditBs || 0);
          debitUsd += Number(item.debitUsd || 0);
          creditUsd += Number(item.creditUsd || 0);
        }
        const netBs = account.type === 'INGRESOS' || account.type === 'PASIVO' || account.type === 'PATRIMONIO'
          ? creditBs - debitBs : debitBs - creditBs;
        const netUsd = account.type === 'INGRESOS' || account.type === 'PASIVO' || account.type === 'PATRIMONIO'
          ? creditUsd - debitUsd : debitUsd - creditUsd;
        return { code: account.code, name: account.name, type: account.type, debitBs, creditBs, debitUsd, creditUsd, netBs, netUsd };
      })
      .filter(row => Math.abs(row.debitBs) > 0.004 || Math.abs(row.creditBs) > 0.004 || Math.abs(row.debitUsd) > 0.000004 || Math.abs(row.creditUsd) > 0.000004);
    const sum = (types: string[], field: 'netBs' | 'netUsd') => rows.filter(r => types.includes(r.type)).reduce((total, r) => total + r[field], 0);
    const grossIncomeBs = sum(['INGRESOS'], 'netBs');
    const grossIncomeUsd = sum(['INGRESOS'], 'netUsd');
    const costsBs = sum(['COSTOS'], 'netBs');
    const costsUsd = sum(['COSTOS'], 'netUsd');
    const expensesBs = sum(['GASTOS'], 'netBs');
    const expensesUsd = sum(['GASTOS'], 'netUsd');
    const legalReserveRows = rows.filter(r => /reserva\s+legal/i.test(r.name) || /reserva legal/i.test(r.code));
    const retentionRows = rows.filter(r => /retenci[oó]n|retenciones/i.test(r.name));
    return {
      entriesCount: fiscalEntries.length,
      rows,
      grossIncomeBs, grossIncomeUsd,
      costsBs, costsUsd, expensesBs, expensesUsd,
      grossProfitBs: grossIncomeBs - costsBs,
      grossProfitUsd: grossIncomeUsd - costsUsd,
      netProfitBs: grossIncomeBs - costsBs - expensesBs,
      netProfitUsd: grossIncomeUsd - costsUsd - expensesUsd,
      legalReserveRows,
      retentionRows,
      bcvRates: fiscalEntries.map(e => Number(e.bcvRate)).filter(rate => Number.isFinite(rate) && rate > 0)
    };
  }, [accounts, journalEntries, currentCompany.id, year]);

  const equityReport = useMemo(
    () => buildEquityChangesReport(journalEntries, accounts, currentCompany.id, Number(year)),
    [journalEntries, accounts, currentCompany.id, year]
  );

  const money = (bs: number, usd: number) => (
    <span className="text-right font-mono">
      {displayCurrency !== 'USD' && <span>{formatBs(bs)}</span>}
      {displayCurrency === 'DUAL' && <span className="block text-[10px] text-slate-500">{formatUsd(usd)}</span>}
      {displayCurrency === 'USD' && <span>{formatUsd(usd)}</span>}
    </span>
  );

  const exportCsv = () => {
    const rows = [
      ['SICOVEN - REPORTE ANUAL', currentCompany.name, 'RIF', currentCompany.rif, 'Ejercicio', year],
      ['Concepto', 'Bolívares (Bs.)', 'Equivalente USD contabilizado'],
      ['Ingresos netos contables', report.grossIncomeBs.toFixed(2), report.grossIncomeUsd.toFixed(6)],
      ['Costos', report.costsBs.toFixed(2), report.costsUsd.toFixed(6)],
      ['Gastos', report.expensesBs.toFixed(2), report.expensesUsd.toFixed(6)],
      ['Utilidad / (Pérdida) antes de impuestos', report.netProfitBs.toFixed(2), report.netProfitUsd.toFixed(6)],
      [],
      ['ESTADO DE CAMBIOS EN EL PATRIMONIO', 'Bolívares (Bs.)', 'USD'],
      ['Saldo inicial', equityReport.openingTotalBs.toFixed(2), equityReport.openingTotalUsd.toFixed(6)],
      ['Movimientos patrimoniales', equityReport.movementTotalBs.toFixed(2), equityReport.movementTotalUsd.toFixed(6)],
      ['Saldo final', equityReport.closingTotalBs.toFixed(2), equityReport.closingTotalUsd.toFixed(6)],
      [],
      ['Cuenta patrimonial', 'Saldo inicial Bs.', 'Saldo inicial USD', 'Movimientos Bs.', 'Movimientos USD', 'Saldo final Bs.', 'Saldo final USD'],
      ...equityReport.rows.map(r => [r.accountCode, r.openingBs.toFixed(2), r.openingUsd.toFixed(6), r.movementBs.toFixed(2), r.movementUsd.toFixed(6), r.closingBs.toFixed(2), r.closingUsd.toFixed(6)]),
      [],
      [],
      ['NOTAS Y REVELACIONES', 'Número', 'Categoría', 'Estado', 'Título', 'Contenido', 'Cuentas fuente', 'Asientos fuente'],
      ...yearDisclosures.map(note => ['', note.noteNumber, note.kind, note.status, note.title, note.body, note.sourceAccountCodes.join(', '), note.sourceEntryIds.join(', ')]),
      [],
      ['ANEXO CUANTITATIVO - MOVIMIENTOS POR CUENTA', 'Cuenta', 'Debe Bs.', 'Haber Bs.', 'Neto Bs.', 'Debe USD', 'Haber USD', 'Neto USD', 'Asientos'],
      ...disclosureMovements.map(row => {
        const account = accounts.find(item => item.code === row.accountCode);
        const creditNormal = account?.type === 'INGRESOS' || account?.type === 'PASIVO' || account?.type === 'PATRIMONIO';
        return ['', row.accountCode + ' - ' + row.accountName, row.debitBs.toFixed(2), row.creditBs.toFixed(2), (creditNormal ? row.creditBs-row.debitBs : row.debitBs-row.creditBs).toFixed(2), row.debitUsd.toFixed(6), row.creditUsd.toFixed(6), (creditNormal ? row.creditUsd-row.debitUsd : row.debitUsd-row.creditUsd).toFixed(6), row.entryIds.length];
      }),
      [],
      ['Fecha', 'Asiento', 'Tipo', 'Cuenta', 'Concepto', 'Neto Bs.', 'Neto USD'],
      ...equityReport.movements.map(m => [m.date, m.entryNumber, m.type, m.accountCode, m.description, m.netBs.toFixed(2), m.netUsd.toFixed(6)]),
      [],
      ['Código', 'Cuenta', 'Tipo', 'Debe Bs.', 'Haber Bs.', 'Debe USD', 'Haber USD', 'Saldo anual Bs.', 'Saldo anual USD'],
      ...report.rows.map(r => [r.code, r.name, r.type, r.debitBs.toFixed(2), r.creditBs.toFixed(2), r.debitUsd.toFixed(6), r.creditUsd.toFixed(6), r.netBs.toFixed(2), r.netUsd.toFixed(6)])
    ];
    const csv = '\ufeff' + rows.map(row => row.map(cell => {
      const value = String(cell ?? '');
      return '"' + value.replace(/"/g, '""') + '"';
    }).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'SICOVEN-Reporte-Anual-' + year + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900"><TrendingUp className="h-5 w-5 text-emerald-600" />Reportes Anuales</div>
          <p className="text-sm text-slate-500">{currentCompany.name} · RIF {currentCompany.rif}</p>
          <p className="mt-1 text-xs text-slate-500">Estado anual consolidado calculado desde los asientos contabilizados de la empresa activa.</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <button onClick={onBack} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Volver</button>
          <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"><FileSpreadsheet className="h-4 w-4" />Exportar CSV</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Printer className="h-4 w-4" />Imprimir / PDF</button>
        </div>
      </div>
      <div className="mt-5 max-w-xs">
        <label className="text-xs font-semibold text-slate-600">Ejercicio económico
          <select value={year} onChange={e => setYear(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>El equivalente USD refleja los importes USD guardados en cada asiento; no se recalcula con la tasa BCV actual. La utilidad mostrada es antes de ISLR y no constituye por sí sola una determinación fiscal.</p>
      </div>
    </section>


    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4">
        <h2 className="font-bold text-slate-900">Notas y revelaciones · {year}</h2>
        <p className="mt-1 text-xs text-slate-500">Información cualitativa ingresada por el profesional y movimientos cuantitativos trazables a los asientos. El sistema no presume políticas, estimaciones, contingencias ni compromisos que no hayan sido documentados.</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700">Categoría
            <select value={disclosureKind} onChange={e => setDisclosureKind(e.target.value as FinancialDisclosureKind)} className="mt-1 w-full rounded-lg border p-2 text-sm">
              <option value="ACCOUNTING_POLICY">Política contable</option><option value="ESTIMATE">Estimación contable</option>
              <option value="COMMITMENT">Compromiso</option><option value="CONTINGENCY">Contingencia</option>
              <option value="RELATED_PARTY">Partes relacionadas</option><option value="SUBSEQUENT_EVENT">Hecho posterior</option><option value="OTHER">Otra revelación</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">Título de la nota
            <input value={disclosureTitle} onChange={e => setDisclosureTitle(e.target.value)} maxLength={180} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="Ej. Bases de preparación de los estados financieros" />
          </label>
          <label className="block text-xs font-semibold text-slate-700">Contenido / revelación
            <textarea value={disclosureBody} onChange={e => setDisclosureBody(e.target.value)} maxLength={12000} rows={5} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="Describa la política, estimación, compromiso o hecho. No se generan afirmaciones automáticamente." />
          </label>
          <label className="block text-xs font-semibold text-slate-700">Códigos de cuentas fuente (separados por coma)
            <input value={disclosureAccounts} onChange={e => setDisclosureAccounts(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="1.1.01, 2.1.01" />
          </label>
          <label className="block text-xs font-semibold text-slate-700">IDs de asientos fuente (separados por coma)
            <input value={disclosureEntries} onChange={e => setDisclosureEntries(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="ID exacto del asiento" />
          </label>
          <label className="block text-xs font-semibold text-slate-700">Estado
            <select value={disclosureStatus} onChange={e => setDisclosureStatus(e.target.value as 'DRAFT' | 'REVIEWED')} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="DRAFT">Borrador</option><option value="REVIEWED">Revisada por el profesional</option></select>
          </label>
          {disclosureError && <p role="alert" className="text-xs text-rose-700">{disclosureError}</p>}
          <button type="button" disabled={disclosureSaving || !disclosureTitle.trim() || !disclosureBody.trim()} onClick={saveDisclosure} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{disclosureSaving ? 'Guardando…' : 'Guardar nota'}</button>
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Notas registradas ({yearDisclosures.length})</h3>
          {yearDisclosures.length ? <div className="mt-2 space-y-2">{yearDisclosures.map(note => <article key={note.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{note.noteNumber}. {note.title}</p><span className="rounded bg-slate-100 px-2 py-1 text-[10px]">{note.status === 'REVIEWED' ? 'Revisada' : 'Borrador'}</span></div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{note.body}</p>
            <p className="mt-2 text-[10px] text-slate-500">Cuentas: {note.sourceAccountCodes.join(', ') || 'No indicadas'} · Asientos: {note.sourceEntryIds.length}</p>
          </article>)}</div> : <p className="mt-2 text-xs text-slate-500">No hay notas registradas para este ejercicio.</p>}
        </div>
      </div>
      <div className="border-t p-4">
        <h3 className="font-bold text-slate-900">Anexo cuantitativo: movimientos por cuenta</h3>
        <p className="mt-1 text-xs text-slate-500">Acumulado de movimientos del ejercicio, excluye asientos CIERRE. Bs. y USD se presentan en columnas independientes; no equivale por sí solo al saldo de cierre ni al balance general.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[850px] w-full text-xs">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Cuenta</th><th className="p-2 text-right">Debe Bs.</th><th className="p-2 text-right">Haber Bs.</th><th className="p-2 text-right">Neto Bs.</th><th className="p-2 text-right">Debe USD</th><th className="p-2 text-right">Haber USD</th><th className="p-2 text-right">Neto USD</th><th className="p-2 text-right">Asientos</th></tr></thead>
          <tbody className="divide-y">{disclosureMovements.map(row => {
            const account = accounts.find(item => item.code === row.accountCode);
            const creditNormal = account?.type === 'INGRESOS' || account?.type === 'PASIVO' || account?.type === 'PATRIMONIO';
            const netBs = creditNormal ? row.creditBs - row.debitBs : row.debitBs - row.creditBs;
            const netUsd = creditNormal ? row.creditUsd - row.debitUsd : row.debitUsd - row.creditUsd;
            return <tr key={row.accountCode}><td className="p-2">{row.accountCode} · {row.accountName}</td><td className="p-2 text-right font-mono">{formatBs(row.debitBs)}</td><td className="p-2 text-right font-mono">{formatBs(row.creditBs)}</td><td className="p-2 text-right font-mono">{formatBs(netBs)}</td><td className="p-2 text-right font-mono">{formatUsd(row.debitUsd)}</td><td className="p-2 text-right font-mono">{formatUsd(row.creditUsd)}</td><td className="p-2 text-right font-mono">{formatUsd(netUsd)}</td><td className="p-2 text-right">{row.entryIds.length}</td></tr>;
          })}</tbody>
          {!disclosureMovements.length && <tbody><tr><td colSpan={8} className="p-4 text-center text-slate-500">Sin movimientos contabilizados para este ejercicio.</td></tr></tbody>}
        </table></div>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Ingresos netos contables" bs={report.grossIncomeBs} usd={report.grossIncomeUsd} money={money} />
      <Metric title="Costos del ejercicio" bs={report.costsBs} usd={report.costsUsd} money={money} />
      <Metric title="Gastos del ejercicio" bs={report.expensesBs} usd={report.expensesUsd} money={money} />
      <div className={'rounded-xl border p-4 shadow-sm ' + (report.netProfitBs >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50')}>
        <p className="text-xs font-semibold text-slate-600">Utilidad / (Pérdida) antes de impuestos</p>
        <div className={'mt-2 text-lg font-bold ' + (report.netProfitBs >= 0 ? 'text-emerald-800' : 'text-rose-800')}>{money(report.netProfitBs, report.netProfitUsd)}</div>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-4">
        <div><h2 className="font-bold text-slate-900">Estado consolidado de resultados · {year}</h2><p className="mt-1 text-xs text-slate-500">{report.entriesCount} asientos incluidos · Excluye asientos tipo CIERRE para evitar duplicar resultados.</p></div>
      </div>
      <div className="divide-y divide-slate-100 p-4 text-sm">
        <ResultLine label="Ingresos netos contables" bs={report.grossIncomeBs} usd={report.grossIncomeUsd} money={money} />
        <ResultLine label="(-) Costos" bs={-report.costsBs} usd={-report.costsUsd} money={money} />
        <ResultLine label="Utilidad bruta" bs={report.grossProfitBs} usd={report.grossProfitUsd} money={money} bold />
        <ResultLine label="(-) Gastos operativos y administrativos" bs={-report.expensesBs} usd={-report.expensesUsd} money={money} />
        <ResultLine label="Resultado antes de impuestos" bs={report.netProfitBs} usd={report.netProfitUsd} money={money} bold />
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4">
        <h2 className="font-bold text-slate-900">Estado de Cambios en el Patrimonio · {year}</h2>
        <p className="mt-1 text-xs text-slate-500">Roll-forward de cuentas patrimoniales basado exclusivamente en asientos contabilizados de la empresa activa.</p>
        <p className="mt-1 text-xs text-slate-500">{equityReport.openingEntryId ? 'Saldo inicial tomado del asiento de apertura anual.' : 'Saldo inicial reconstruido desde los movimientos anteriores al ejercicio.'} {equityReport.resultTransferredToEquity ? 'El cierre del ejercicio contiene la transferencia del resultado al patrimonio.' : 'El resultado del ejercicio aún no aparece transferido por un asiento de cierre y se presenta por separado.'}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-xs">
          <thead className="bg-slate-100 text-slate-700"><tr>
            <th className="p-3 text-left">Cuenta / concepto</th>
            <th className="p-3 text-right">Saldo inicial Bs.</th><th className="p-3 text-right">Saldo inicial USD</th>
            <th className="p-3 text-right">Variación Bs.</th><th className="p-3 text-right">Variación USD</th>
            <th className="p-3 text-right">Saldo final Bs.</th><th className="p-3 text-right">Saldo final USD</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {equityReport.rows.map(row => <tr key={row.accountCode}>
              <td className="p-3"><span className="font-mono text-slate-500">{row.accountCode}</span> · {row.accountName}</td>
              <td className="p-3 text-right font-mono">{formatBs(row.openingBs)}</td><td className="p-3 text-right font-mono">{formatUsd(row.openingUsd)}</td>
              <td className="p-3 text-right font-mono">{formatBs(row.movementBs)}</td><td className="p-3 text-right font-mono">{formatUsd(row.movementUsd)}</td>
              <td className="p-3 text-right font-mono font-semibold">{formatBs(row.closingBs)}</td><td className="p-3 text-right font-mono font-semibold">{formatUsd(row.closingUsd)}</td>
            </tr>)}
            {!equityReport.rows.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No existen movimientos patrimoniales contabilizados para este ejercicio.</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold"><tr>
            <td className="p-3">TOTAL PATRIMONIO</td>
            <td className="p-3 text-right font-mono">{formatBs(equityReport.openingTotalBs)}</td><td className="p-3 text-right font-mono">{formatUsd(equityReport.openingTotalUsd)}</td>
            <td className="p-3 text-right font-mono">{formatBs(equityReport.movementTotalBs)}</td><td className="p-3 text-right font-mono">{formatUsd(equityReport.movementTotalUsd)}</td>
            <td className="p-3 text-right font-mono">{formatBs(equityReport.closingTotalBs)}</td><td className="p-3 text-right font-mono">{formatUsd(equityReport.closingTotalUsd)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div className="border-t border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800">Trazabilidad de movimientos patrimoniales</h3>
        {equityReport.movements.length ? <div className="mt-2 overflow-x-auto"><table className="min-w-[760px] w-full text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Asiento</th><th className="p-2 text-left">Cuenta</th><th className="p-2 text-left">Concepto</th><th className="p-2 text-right">Neto Bs.</th><th className="p-2 text-right">Neto USD</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{equityReport.movements.map((movement, index) => <tr key={movement.entryId + movement.accountCode + index}>
            <td className="p-2">{movement.date}</td><td className="p-2">#{movement.entryNumber} · {movement.type}</td>
            <td className="p-2 font-mono">{movement.accountCode}</td><td className="p-2">{movement.description}</td>
            <td className="p-2 text-right font-mono">{formatBs(movement.netBs)}</td><td className="p-2 text-right font-mono">{formatUsd(movement.netUsd)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="mt-2 text-xs text-slate-500">No hay movimientos directos en cuentas patrimoniales durante el ejercicio.</p>}
      </div>
      <p className="border-t border-slate-200 p-3 text-[11px] text-slate-500">El sistema no atribuye automáticamente movimientos a dividendos, aportes, reservas o ajustes si el asiento no identifica esa naturaleza. Revise el asiento fuente antes de emitir el estado como información financiera formal.</p>
    </section>

    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-900">Reserva legal</h3>
        {report.legalReserveRows.length ? <div className="mt-3 space-y-2">{report.legalReserveRows.map(r => <div key={r.code} className="flex justify-between gap-3 text-xs"><span>{r.code} · {r.name}</span>{money(r.netBs, r.netUsd)}</div>)}</div> : <p className="mt-2 text-xs text-slate-500">No se identificaron cuentas con nombre “Reserva legal” en el movimiento anual de este ejercicio.</p>}
        <p className="mt-3 text-[11px] text-slate-500">Se muestran movimientos contables identificados por nombre; no se calcula ni registra una apropiación legal automática.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-900">Retenciones registradas</h3>
        {report.retentionRows.length ? <div className="mt-3 space-y-2">{report.retentionRows.map(r => <div key={r.code} className="flex justify-between gap-3 text-xs"><span>{r.code} · {r.name}</span>{money(r.netBs, r.netUsd)}</div>)}</div> : <p className="mt-2 text-xs text-slate-500">No se identificaron cuentas de retenciones por nombre en los movimientos del ejercicio.</p>}
        <p className="mt-3 text-[11px] text-slate-500">La vista informa saldos de cuentas contables; los comprobantes fiscales y las obligaciones deben validarse en sus módulos específicos.</p>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b bg-slate-50 p-4"><h3 className="font-bold text-slate-900">Detalle anual por cuenta de resultado y obligaciones relacionadas</h3></div>
      <div className="overflow-x-auto"><table className="min-w-[850px] w-full text-xs">
        <thead className="bg-slate-100 text-slate-700"><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Cuenta</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-right">Debe Bs.</th><th className="p-3 text-right">Haber Bs.</th><th className="p-3 text-right">Saldo Bs.</th><th className="p-3 text-right">Saldo USD</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{report.rows.map(r => <tr key={r.code}><td className="p-3 font-mono">{r.code}</td><td className="p-3">{r.name}</td><td className="p-3">{r.type}</td><td className="p-3 text-right font-mono">{formatBs(r.debitBs)}</td><td className="p-3 text-right font-mono">{formatBs(r.creditBs)}</td><td className="p-3 text-right font-mono">{formatBs(r.netBs)}</td><td className="p-3 text-right font-mono">{formatUsd(r.netUsd)}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-bold text-amber-950">Cierre de ejercicio: revisión previa</h3>
      <p className="mt-1 text-xs text-amber-900">El informe calcula automáticamente el resultado anual, pero todavía no contabiliza el asiento de cierre ni bloquea fechas históricas. Esa operación requiere persistir un estado de ejercicio cerrado y validar que no existan cierres duplicados; no se simula aquí para evitar alterar libros contables sin controles transaccionales.</p>
      <button onClick={() => setShowClosingChecklist(v => !v)} className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-bold text-amber-950">{showClosingChecklist ? 'Ocultar revisión' : 'Revisar condiciones de cierre'}</button>
      {showClosingChecklist && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-950">
        <li>Validar que todos los asientos del ejercicio estén cuadrados y aprobados.</li>
        <li>Revisar conciliaciones bancarias, inventario, CxC, CxP y retenciones.</li>
        <li>Determinar ISLR, reserva legal y otras apropiaciones según el caso de la entidad.</li>
        <li>Generar asiento de cierre único y trasladar resultado a patrimonio.</li>
        <li>Bloquear el ejercicio cerrado y conservar trazabilidad para ajustes autorizados.</li>
      </ul>}
    </section>

    <div className="hidden print:grid grid-cols-2 gap-12 pt-10 text-xs">
      <div className="text-center"><div className="mx-auto w-60 border-t border-black pt-1"></div><p className="font-bold">CONTADOR PÚBLICO COLEGIADO</p><p>C.P.C. N° __________ · Firma y sello</p></div>
      <div className="text-center"><div className="mx-auto w-60 border-t border-black pt-1"></div><p className="font-bold">{currentCompany.name}</p><p>Representante legal</p></div>
    </div>
  </div>;
};

const Metric: React.FC<{ title: string; bs: number; usd: number; money: (bs: number, usd: number) => React.ReactNode }> = ({ title, bs, usd, money }) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-600">{title}</p><div className="mt-2 text-lg font-bold text-slate-900">{money(bs, usd)}</div></div>;

const ResultLine: React.FC<{ label: string; bs: number; usd: number; money: (bs: number, usd: number) => React.ReactNode; bold?: boolean }> = ({ label, bs, usd, money, bold }) => <div className={'flex items-center justify-between gap-4 py-3 ' + (bold ? 'font-bold text-slate-900' : 'text-slate-700')}><span>{label}</span>{money(bs, usd)}</div>;
