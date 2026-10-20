import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  Scale,
  Printer,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  SlidersHorizontal,
  Building,
  FileCheck,
  Plus,
  Download
} from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/formatters';
import { NewEntryModal } from '../LibroDiario/NewEntryModal';
import { CompanyLogoHeader } from '../CompanyLogoHeader';
import {
  exportBalanceComprobacionPdf,
  exportBalanceAjustadoPdf,
  exportBalanceGeneralPdf
} from '../../utils/pdfGenerator';

export const BalancesView: React.FC = () => {
  const { currentCompany, accounts, journalEntries, displayCurrency } = useAccounting();

  const [activeReport, setActiveReport] = useState<'COMPROBACION' | 'AJUSTADO' | 'GENERAL'>('COMPROBACION');
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      if (activeReport === 'COMPROBACION') {
        await exportBalanceComprobacionPdf(currentCompany, accountBalances);
      } else if (activeReport === 'AJUSTADO') {
        await exportBalanceAjustadoPdf(currentCompany, accountBalances);
      } else if (activeReport === 'GENERAL') {
        await exportBalanceGeneralPdf(
          currentCompany,
          activoAccounts,
          pasivoAccounts,
          patrimonioAccounts,
          ingresosAccounts,
          costosAccounts,
          gastosAccounts,
          {
            totalActivoBs,
            totalPasivoBs,
            totalPatrimonioBs,
            totalPasivoPatrimonioBs,
            totalIngresosBs,
            totalCostosBs,
            totalGastosBs,
            utilidadNetaBs
          }
        );
      }
    } catch (err) {
      console.error('Error generating Balances PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Separate non-adjusted entries and adjusted entries
  const regularEntries = journalEntries.filter(e => !e.isAdjusted && e.type !== 'AJUSTE');
  const adjustmentEntries = journalEntries.filter(e => e.isAdjusted || e.type === 'AJUSTE');

  // Compute balances per account
  const accountBalances = accounts.map(acc => {
    // 1. Regular entries
    let regDebitBs = 0;
    let regCreditBs = 0;
    let regDebitUsd = 0;
    let regCreditUsd = 0;

    for (const e of regularEntries) {
      for (const it of e.items) {
        if (it.accountCode === acc.code) {
          regDebitBs += it.debitBs || 0;
          regCreditBs += it.creditBs || 0;
          regDebitUsd += it.debitUsd || 0;
          regCreditUsd += it.creditUsd || 0;
        }
      }
    }

    // 2. Adjustments
    let adjDebitBs = 0;
    let adjCreditBs = 0;
    let adjDebitUsd = 0;
    let adjCreditUsd = 0;

    for (const e of adjustmentEntries) {
      for (const it of e.items) {
        if (it.accountCode === acc.code) {
          adjDebitBs += it.debitBs || 0;
          adjCreditBs += it.creditBs || 0;
          adjDebitUsd += it.debitUsd || 0;
          adjCreditUsd += it.creditUsd || 0;
        }
      }
    }

    // Total sums
    const totalDebitBs = regDebitBs + adjDebitBs;
    const totalCreditBs = regCreditBs + adjCreditBs;
    const totalDebitUsd = regDebitUsd + adjDebitUsd;
    const totalCreditUsd = regCreditUsd + adjCreditUsd;

    // Regular net
    const regNetBs = regDebitBs - regCreditBs;
    const regNetUsd = regDebitUsd - regCreditUsd;
    const unadjustedDebitBs = regNetBs > 0 ? regNetBs : 0;
    const unadjustedCreditBs = regNetBs < 0 ? Math.abs(regNetBs) : 0;
    const unadjustedDebitUsd = regNetUsd > 0 ? regNetUsd : 0;
    const unadjustedCreditUsd = regNetUsd < 0 ? Math.abs(regNetUsd) : 0;

    // Adjusted net
    const adjNetBs = totalDebitBs - totalCreditBs;
    const adjNetUsd = totalDebitUsd - totalCreditUsd;
    const adjustedDebitBs = adjNetBs > 0 ? adjNetBs : 0;
    const adjustedCreditBs = adjNetBs < 0 ? Math.abs(adjNetBs) : 0;
    const adjustedDebitUsd = adjNetUsd > 0 ? adjNetUsd : 0;
    const adjustedCreditUsd = adjNetUsd < 0 ? Math.abs(adjNetUsd) : 0;

    return {
      code: acc.code,
      name: acc.name,
      type: acc.type,
      level: acc.level,
      isMovement: acc.isMovement,

      // Sumas
      totalDebitBs,
      totalCreditBs,
      totalDebitUsd,
      totalCreditUsd,

      // Unadjusted
      unadjustedDebitBs,
      unadjustedCreditBs,
      unadjustedDebitUsd,
      unadjustedCreditUsd,

      // Adjustments
      adjDebitBs,
      adjCreditBs,
      adjDebitUsd,
      adjCreditUsd,

      // Final Adjusted
      adjustedDebitBs,
      adjustedCreditBs,
      adjustedDebitUsd,
      adjustedCreditUsd,

      hasMovement: totalDebitBs > 0 || totalCreditBs > 0
    };
  });

  const activeAccounts = accountBalances.filter(a => a.hasMovement);

  // Totals for Balance de Comprobación
  const sumTotalDebitBs = activeAccounts.reduce((s, a) => s + a.totalDebitBs, 0);
  const sumTotalCreditBs = activeAccounts.reduce((s, a) => s + a.totalCreditBs, 0);
  const sumDebitBalancesBs = activeAccounts.reduce((s, a) => s + a.adjustedDebitBs, 0);
  const sumCreditBalancesBs = activeAccounts.reduce((s, a) => s + a.adjustedCreditBs, 0);

  const sumTotalDebitUsd = activeAccounts.reduce((s, a) => s + a.totalDebitUsd, 0);
  const sumTotalCreditUsd = activeAccounts.reduce((s, a) => s + a.totalCreditUsd, 0);
  const sumDebitBalancesUsd = activeAccounts.reduce((s, a) => s + a.adjustedDebitUsd, 0);
  const sumCreditBalancesUsd = activeAccounts.reduce((s, a) => s + a.adjustedCreditUsd, 0);

  // Check equality
  const isComprobacionSquare =
    Math.abs(sumTotalDebitBs - sumTotalCreditBs) < 0.05 &&
    Math.abs(sumDebitBalancesBs - sumCreditBalancesBs) < 0.05;

  // Balance General Calculations (VEN-NIF)
  const activoAccounts = activeAccounts.filter(a => a.type === 'ACTIVO');
  const pasivoAccounts = activeAccounts.filter(a => a.type === 'PASIVO');
  const patrimonioAccounts = activeAccounts.filter(a => a.type === 'PATRIMONIO');
  const ingresosAccounts = activeAccounts.filter(a => a.type === 'INGRESOS');
  const costosAccounts = activeAccounts.filter(a => a.type === 'COSTOS');
  const gastosAccounts = activeAccounts.filter(a => a.type === 'GASTOS');

  // Activos netos (Deudor - Acreedor)
  const totalActivoBs = activoAccounts.reduce(
    (s, a) => s + (a.adjustedDebitBs - a.adjustedCreditBs),
    0
  );
  const totalActivoUsd = activoAccounts.reduce(
    (s, a) => s + (a.adjustedDebitUsd - a.adjustedCreditUsd),
    0
  );

  // Pasivos netos (Acreedor - Deudor)
  const totalPasivoBs = pasivoAccounts.reduce(
    (s, a) => s + (a.adjustedCreditBs - a.adjustedDebitBs),
    0
  );
  const totalPasivoUsd = pasivoAccounts.reduce(
    (s, a) => s + (a.adjustedCreditUsd - a.adjustedDebitUsd),
    0
  );

  // Estado de Resultados: Utilidad o Pérdida Neta
  const totalIngresosBs = ingresosAccounts.reduce(
    (s, a) => s + (a.adjustedCreditBs - a.adjustedDebitBs),
    0
  );
  const totalCostosBs = costosAccounts.reduce(
    (s, a) => s + (a.adjustedDebitBs - a.adjustedCreditBs),
    0
  );
  const totalGastosBs = gastosAccounts.reduce(
    (s, a) => s + (a.adjustedDebitBs - a.adjustedCreditBs),
    0
  );
  const utilidadNetaBs = totalIngresosBs - totalCostosBs - totalGastosBs;

  const totalIngresosUsd = ingresosAccounts.reduce(
    (s, a) => s + (a.adjustedCreditUsd - a.adjustedDebitUsd),
    0
  );
  const totalCostosUsd = costosAccounts.reduce(
    (s, a) => s + (a.adjustedDebitUsd - a.adjustedCreditUsd),
    0
  );
  const totalGastosUsd = gastosAccounts.reduce(
    (s, a) => s + (a.adjustedDebitUsd - a.adjustedCreditUsd),
    0
  );
  const utilidadNetaUsd = totalIngresosUsd - totalCostosUsd - totalGastosUsd;

  // Patrimonio Neto = Cuentas de Patrimonio + Utilidad del Ejercicio
  const patrimonioBaseBs = patrimonioAccounts.reduce(
    (s, a) => s + (a.adjustedCreditBs - a.adjustedDebitBs),
    0
  );
  const totalPatrimonioBs = patrimonioBaseBs + utilidadNetaBs;

  const patrimonioBaseUsd = patrimonioAccounts.reduce(
    (s, a) => s + (a.adjustedCreditUsd - a.adjustedDebitUsd),
    0
  );
  const totalPatrimonioUsd = patrimonioBaseUsd + utilidadNetaUsd;

  const totalPasivoPatrimonioBs = totalPasivoBs + totalPatrimonioBs;
  const totalPasivoPatrimonioUsd = totalPasivoUsd + totalPatrimonioUsd;

  const ecuacionCuadrada = Math.abs(totalActivoBs - totalPasivoPatrimonioBs) < 0.05;

  return (
    <div className="space-y-6">
      {/* Official Header with Selected Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle={
            activeReport === 'COMPROBACION'
              ? 'Balance de Comprobación de Sumas y Saldos'
              : activeReport === 'AJUSTADO'
              ? 'Balance de Comprobación Ajustado (Hoja de Trabajo)'
              : 'Estado de Situación Financiera y Estado de Resultados'
          }
          subtitle={
            activeReport === 'COMPROBACION'
              ? 'Confrontación de Totales y Saldos según Principios VEN-NIF (FCCPV)'
              : activeReport === 'AJUSTADO'
              ? 'Hoja de Trabajo de 6 Columnas con Asientos de Ajuste y Saldos Finales'
              : 'Clasificado según Normas Internacionales de Contabilidad VEN-NIF NIC 1'
          }
          periodText={`Ejercicio Fiscal ${currentCompany.fiscalYear}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Cuentas con movimiento: <strong className="text-slate-900">{activeAccounts.length}</strong></span>
            <span>•</span>
            <span className={isComprobacionSquare ? 'text-emerald-700 font-medium' : 'text-rose-600 font-medium'}>
              {isComprobacionSquare ? 'Partida Doble Cuadrada' : 'Descuadre detectado'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300 shadow-sm"
              title="Descargar archivo PDF oficial con logo y márgenes normalizados"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF Oficial'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Reporte
            </button>
            {activeReport === 'AJUSTADO' && (
              <button
                onClick={() => setIsAdjustmentModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition shadow cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear Asiento de Ajuste
              </button>
            )}
          </div>
        </div>

        {/* Report Tabs Switcher (no-print) */}
        <div className="flex items-center gap-2 pt-4 border-slate-200 no-print overflow-x-auto">
          <button
            onClick={() => setActiveReport('COMPROBACION')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeReport === 'COMPROBACION'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Scale className="w-4 h-4 text-emerald-400" />
            1. Balance de Comprobación
          </button>

          <button
            onClick={() => setActiveReport('AJUSTADO')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeReport === 'AJUSTADO'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            2. Balance de Comprobación Ajustado
          </button>

          <button
            onClick={() => setActiveReport('GENERAL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeReport === 'GENERAL'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building className="w-4 h-4 text-sky-400" />
            3. Balance General & Estado de Resultados
          </button>
        </div>
      </div>

      {/* 1. BALANCE DE COMPROBACIÓN */}
      {activeReport === 'COMPROBACION' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Balance de Comprobación de Sumas y Saldos
              </h2>
              <p className="text-xs text-slate-500">
                Al {new Date().toLocaleDateString('es-VE')} • Tasa BCV: Bs. {currentCompany.bcvRate.toFixed(2)}
              </p>
            </div>
            {isComprobacionSquare ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Sumas y Saldos Cuadrados (Partida Doble)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-300">
                <AlertCircle className="w-4 h-4" />
                Descuadre en Sumas de Comprobación
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-semibold">
                  <th className="py-2.5 px-3 w-28">Código</th>
                  <th className="py-2.5 px-3">Cuenta Contable (VEN-NIF)</th>
                  <th className="py-2.5 px-3 w-20 text-center">Tipo</th>
                  <th colSpan={displayCurrency === 'DUAL' ? 2 : 1} className="py-2.5 px-3 text-center border-l border-slate-200 bg-slate-200/50">
                    SUMAS DEL MAYOR
                  </th>
                  <th colSpan={displayCurrency === 'DUAL' ? 2 : 1} className="py-2.5 px-3 text-center border-l border-slate-200 bg-emerald-50/50">
                    SALDOS AJUSTADOS
                  </th>
                </tr>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <th></th>
                  <th></th>
                  <th></th>
                  <th className="py-1 px-3 text-right border-l border-slate-200 font-medium">Debe</th>
                  <th className="py-1 px-3 text-right font-medium">Haber</th>
                  <th className="py-1 px-3 text-right border-l border-slate-200 font-medium text-emerald-900">Deudor</th>
                  <th className="py-1 px-3 text-right font-medium text-emerald-900">Acreedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeAccounts.map(acc => (
                  <tr key={acc.code} className="hover:bg-slate-50/80 transition">
                    <td className="py-2 px-3 font-mono font-medium text-slate-700">{acc.code}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{acc.name}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-slate-100 text-slate-600">
                        {acc.type}
                      </span>
                    </td>

                    {/* Sumas */}
                    <td className="py-2 px-3 text-right font-mono border-l border-slate-100 text-slate-800">
                      {displayCurrency !== 'USD' && formatBs(acc.totalDebitBs)}
                      {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(acc.totalDebitUsd)}</div>}
                      {displayCurrency === 'USD' && formatUsd(acc.totalDebitUsd)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800">
                      {displayCurrency !== 'USD' && formatBs(acc.totalCreditBs)}
                      {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(acc.totalCreditUsd)}</div>}
                      {displayCurrency === 'USD' && formatUsd(acc.totalCreditUsd)}
                    </td>

                    {/* Saldos */}
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 border-l border-slate-100 bg-slate-50/30">
                      {acc.adjustedDebitBs > 0 ? (
                        <>
                          {displayCurrency !== 'USD' && formatBs(acc.adjustedDebitBs)}
                          {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(acc.adjustedDebitUsd)}</div>}
                          {displayCurrency === 'USD' && formatUsd(acc.adjustedDebitUsd)}
                        </>
                      ) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 bg-slate-50/30">
                      {acc.adjustedCreditBs > 0 ? (
                        <>
                          {displayCurrency !== 'USD' && formatBs(acc.adjustedCreditBs)}
                          {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(acc.adjustedCreditUsd)}</div>}
                          {displayCurrency === 'USD' && formatUsd(acc.adjustedCreditUsd)}
                        </>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold border-t border-slate-800">
                  <td colSpan={3} className="py-3 px-3 text-right text-slate-300">
                    TOTALES Y COMPROBACIÓN:
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400 border-l border-slate-800">
                    {displayCurrency !== 'USD' && formatBs(sumTotalDebitBs)}
                    {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(sumTotalDebitUsd)}</div>}
                    {displayCurrency === 'USD' && formatUsd(sumTotalDebitUsd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400">
                    {displayCurrency !== 'USD' && formatBs(sumTotalCreditBs)}
                    {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(sumTotalCreditUsd)}</div>}
                    {displayCurrency === 'USD' && formatUsd(sumTotalCreditUsd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-sky-400 border-l border-slate-800">
                    {displayCurrency !== 'USD' && formatBs(sumDebitBalancesBs)}
                    {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(sumDebitBalancesUsd)}</div>}
                    {displayCurrency === 'USD' && formatUsd(sumDebitBalancesUsd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-sky-400">
                    {displayCurrency !== 'USD' && formatBs(sumCreditBalancesBs)}
                    {displayCurrency === 'DUAL' && <div className="text-[10px] text-slate-400">{formatUsd(sumCreditBalancesUsd)}</div>}
                    {displayCurrency === 'USD' && formatUsd(sumCreditBalancesUsd)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 2. BALANCE DE COMPROBACIÓN AJUSTADO */}
      {activeReport === 'AJUSTADO' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                Hoja de Trabajo y Balance de Comprobación Ajustado (6 Columnas VEN-NIF)
              </h2>
              <p className="text-xs text-amber-800">
                Integra asientos de ajuste (depreciaciones, devengados, provisiones y reexpresión)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-lg border border-amber-200">
                Asientos de Ajuste: <strong className="text-amber-800">{adjustmentEntries.length}</strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                  <th className="py-2.5 px-3 w-28">Código</th>
                  <th className="py-2.5 px-3">Cuenta Contable</th>
                  <th colSpan={2} className="py-2.5 px-3 text-center border-l border-slate-200 bg-slate-200/50">
                    SALDO ANTES DE AJUSTE
                  </th>
                  <th colSpan={2} className="py-2.5 px-3 text-center border-l border-slate-200 bg-amber-100/50 text-amber-900">
                    ASIENTOS DE AJUSTE
                  </th>
                  <th colSpan={2} className="py-2.5 px-3 text-center border-l border-slate-200 bg-emerald-100/50 text-emerald-900">
                    SALDO AJUSTADO
                  </th>
                </tr>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <th></th>
                  <th></th>
                  <th className="py-1 px-3 text-right border-l border-slate-200 font-medium">Debe</th>
                  <th className="py-1 px-3 text-right font-medium">Haber</th>
                  <th className="py-1 px-3 text-right border-l border-slate-200 font-medium text-amber-900">Debe</th>
                  <th className="py-1 px-3 text-right font-medium text-amber-900">Haber</th>
                  <th className="py-1 px-3 text-right border-l border-slate-200 font-medium text-emerald-900">Deudor</th>
                  <th className="py-1 px-3 text-right font-medium text-emerald-900">Acreedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeAccounts.map(acc => (
                  <tr key={acc.code} className="hover:bg-slate-50/80 transition">
                    <td className="py-2 px-3 font-mono font-medium text-slate-700">{acc.code}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{acc.name}</td>

                    {/* Saldo Previo */}
                    <td className="py-2 px-3 text-right font-mono border-l border-slate-100 text-slate-700">
                      {acc.unadjustedDebitBs > 0 ? formatBs(acc.unadjustedDebitBs) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">
                      {acc.unadjustedCreditBs > 0 ? formatBs(acc.unadjustedCreditBs) : '-'}
                    </td>

                    {/* Ajustes */}
                    <td className="py-2 px-3 text-right font-mono border-l border-slate-100 bg-amber-50/30 text-amber-900">
                      {acc.adjDebitBs > 0 ? formatBs(acc.adjDebitBs) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono bg-amber-50/30 text-amber-900">
                      {acc.adjCreditBs > 0 ? formatBs(acc.adjCreditBs) : '-'}
                    </td>

                    {/* Saldo Ajustado */}
                    <td className="py-2 px-3 text-right font-mono font-bold border-l border-slate-100 bg-emerald-50/30 text-emerald-950">
                      {acc.adjustedDebitBs > 0 ? formatBs(acc.adjustedDebitBs) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold bg-emerald-50/30 text-emerald-950">
                      {acc.adjustedCreditBs > 0 ? formatBs(acc.adjustedCreditBs) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold border-t border-slate-800">
                  <td colSpan={2} className="py-3 px-3 text-right text-slate-300">
                    TOTALES:
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200 border-l border-slate-800">
                    {formatBs(activeAccounts.reduce((s, a) => s + a.unadjustedDebitBs, 0))}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200">
                    {formatBs(activeAccounts.reduce((s, a) => s + a.unadjustedCreditBs, 0))}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-400 border-l border-slate-800">
                    {formatBs(activeAccounts.reduce((s, a) => s + a.adjDebitBs, 0))}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-400">
                    {formatBs(activeAccounts.reduce((s, a) => s + a.adjCreditBs, 0))}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400 border-l border-slate-800">
                    {formatBs(sumDebitBalancesBs)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400">
                    {formatBs(sumCreditBalancesBs)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 3. BALANCE GENERAL & ESTADO DE RESULTADOS */}
      {activeReport === 'GENERAL' && (
        <div className="space-y-6">
          {/* Equation Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-emerald-400 font-bold">
                  Ecuación Fundamental de la Contabilidad (VEN-NIF)
                </div>
                <div className="text-lg font-bold mt-1">
                  ACTIVO = PASIVO + PATRIMONIO NETO
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Total Activo:</span>
                  <span className="text-base font-mono font-bold text-emerald-400">
                    {formatBs(totalActivoBs)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 block">
                    {formatUsd(totalActivoUsd)}
                  </span>
                </div>
                <div className="text-slate-500 font-bold text-lg">=</div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Pasivo + Patrimonio:</span>
                  <span className="text-base font-mono font-bold text-sky-400">
                    {formatBs(totalPasivoPatrimonioBs)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 block">
                    {formatUsd(totalPasivoPatrimonioUsd)}
                  </span>
                </div>

                {ecuacionCuadrada ? (
                  <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30" title="Balance Exactamente Cuadrado">
                    <CheckCircle2 className="w-6 h-6" />
                  </span>
                ) : (
                  <span className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30" title="Descuadre Patrimonial">
                    <AlertCircle className="w-6 h-6" />
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ACTIVO (Lado Izquierdo) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">1. ACTIVO TOTAL</span>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold font-mono text-emerald-300">
                    {formatBs(totalActivoBs)}
                  </div>
                  <div className="text-xs font-mono text-slate-300">
                    {formatUsd(totalActivoUsd)}
                  </div>
                </div>
              </div>

              <div className="p-4 divide-y divide-slate-100 text-xs">
                {activoAccounts.map(acc => {
                  const balanceBs = acc.adjustedDebitBs - acc.adjustedCreditBs;
                  const balanceUsd = acc.adjustedDebitUsd - acc.adjustedCreditUsd;
                  return (
                    <div key={acc.code} className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded">
                      <div>
                        <span className="font-mono text-slate-500 mr-2">{acc.code}</span>
                        <span className="font-medium text-slate-800">{acc.name}</span>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-slate-900">{formatBs(balanceBs)}</div>
                        <div className="text-[10px] text-slate-400">{formatUsd(balanceUsd)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PASIVO Y PATRIMONIO (Lado Derecho) */}
            <div className="space-y-6">
              {/* PASIVOS */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm">2. PASIVO TOTAL</span>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold font-mono text-sky-400">
                      {formatBs(totalPasivoBs)}
                    </div>
                    <div className="text-xs font-mono text-slate-300">
                      {formatUsd(totalPasivoUsd)}
                    </div>
                  </div>
                </div>

                <div className="p-4 divide-y divide-slate-100 text-xs">
                  {pasivoAccounts.length === 0 ? (
                    <div className="text-slate-400 py-3 text-center">Sin pasivos registrados</div>
                  ) : (
                    pasivoAccounts.map(acc => {
                      const balanceBs = acc.adjustedCreditBs - acc.adjustedDebitBs;
                      const balanceUsd = acc.adjustedCreditUsd - acc.adjustedDebitUsd;
                      return (
                        <div key={acc.code} className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded">
                          <div>
                            <span className="font-mono text-slate-500 mr-2">{acc.code}</span>
                            <span className="font-medium text-slate-800">{acc.name}</span>
                          </div>
                          <div className="text-right font-mono">
                            <div className="font-bold text-slate-900">{formatBs(balanceBs)}</div>
                            <div className="text-[10px] text-slate-400">{formatUsd(balanceUsd)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* PATRIMONIO NETO */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-purple-900 text-white flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm">3. PATRIMONIO NETO</span>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold font-mono text-purple-300">
                      {formatBs(totalPatrimonioBs)}
                    </div>
                    <div className="text-xs font-mono text-slate-300">
                      {formatUsd(totalPatrimonioUsd)}
                    </div>
                  </div>
                </div>

                <div className="p-4 divide-y divide-slate-100 text-xs">
                  {patrimonioAccounts.map(acc => {
                    const balanceBs = acc.adjustedCreditBs - acc.adjustedDebitBs;
                    const balanceUsd = acc.adjustedCreditUsd - acc.adjustedDebitUsd;
                    return (
                      <div key={acc.code} className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded">
                        <div>
                          <span className="font-mono text-slate-500 mr-2">{acc.code}</span>
                          <span className="font-medium text-slate-800">{acc.name}</span>
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-bold text-slate-900">{formatBs(balanceBs)}</div>
                          <div className="text-[10px] text-slate-400">{formatUsd(balanceUsd)}</div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Resultado del Ejercicio Económico Actual */}
                  <div className="py-3 flex items-center justify-between bg-purple-50/60 px-2 rounded font-semibold text-purple-900">
                    <div>
                      <span className="font-mono text-purple-700 mr-2">3.3.1.02</span>
                      <span>Resultado Neto del Ejercicio (Ganancia / Pérdida)</span>
                    </div>
                    <div className="text-right font-mono">
                      <div className={`font-bold ${utilidadNetaBs >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatBs(utilidadNetaBs)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {formatUsd(utilidadNetaUsd)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ESTADO DE RESULTADOS INTEGRADO */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wide">
                  Estado de Resultados (Ganancias y Pérdidas)
                </h3>
                <p className="text-xs text-slate-400">
                  Período: Ejercicio Económico Actual • Moneda: Expresado en Bs. y $ USD
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase">Utilidad Neta del Ejercicio:</span>
                <span className={`text-base font-mono font-bold ${utilidadNetaBs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatBs(utilidadNetaBs)}
                </span>
              </div>
            </div>

            <div className="p-6 divide-y divide-slate-100 text-xs">
              {/* Ingresos */}
              <div className="py-3">
                <div className="flex items-center justify-between font-bold text-slate-800 mb-2">
                  <span>(+) Ingresos Operacionales y Ventas:</span>
                  <span className="font-mono text-emerald-700 text-sm">{formatBs(totalIngresosBs)} ({formatUsd(totalIngresosUsd)})</span>
                </div>
                {ingresosAccounts.map(acc => (
                  <div key={acc.code} className="flex items-center justify-between text-slate-600 pl-4 py-1">
                    <span>{acc.code} - {acc.name}</span>
                    <span className="font-mono">{formatBs(acc.adjustedCreditBs - acc.adjustedDebitBs)}</span>
                  </div>
                ))}
              </div>

              {/* Costos */}
              <div className="py-3">
                <div className="flex items-center justify-between font-bold text-slate-800 mb-2">
                  <span>(-) Costo de Ventas:</span>
                  <span className="font-mono text-rose-700 text-sm">-{formatBs(totalCostosBs)} (-{formatUsd(totalCostosUsd)})</span>
                </div>
                {costosAccounts.map(acc => (
                  <div key={acc.code} className="flex items-center justify-between text-slate-600 pl-4 py-1">
                    <span>{acc.code} - {acc.name}</span>
                    <span className="font-mono">-{formatBs(acc.adjustedDebitBs - acc.adjustedCreditBs)}</span>
                  </div>
                ))}
              </div>

              {/* Utilidad Bruta */}
              <div className="py-3 flex items-center justify-between font-bold text-slate-900 bg-slate-50 px-3 rounded">
                <span>(=) Utilidad Bruta en Ventas:</span>
                <span className="font-mono text-sm">{formatBs(totalIngresosBs - totalCostosBs)}</span>
              </div>

              {/* Gastos */}
              <div className="py-3">
                <div className="flex items-center justify-between font-bold text-slate-800 mb-2">
                  <span>(-) Gastos Operacionales y Administrativos:</span>
                  <span className="font-mono text-rose-700 text-sm">-{formatBs(totalGastosBs)} (-{formatUsd(totalGastosUsd)})</span>
                </div>
                {gastosAccounts.map(acc => (
                  <div key={acc.code} className="flex items-center justify-between text-slate-600 pl-4 py-1">
                    <span>{acc.code} - {acc.name}</span>
                    <span className="font-mono">-{formatBs(acc.adjustedDebitBs - acc.adjustedCreditBs)}</span>
                  </div>
                ))}
              </div>

              {/* Utilidad Neta Final */}
              <div className="py-4 flex items-center justify-between font-black text-slate-900 bg-emerald-50/80 px-4 rounded-xl text-sm border border-emerald-200">
                <span className="text-emerald-950 uppercase">Resultado Neto Integral (VEN-NIF NIC 1):</span>
                <div className="text-right font-mono">
                  <div className={`text-base font-bold ${utilidadNetaBs >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatBs(utilidadNetaBs)}
                  </div>
                  <div className="text-xs text-slate-600">
                    {formatUsd(utilidadNetaUsd)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Signatures block (print-only) */}
      <div className="hidden print:grid grid-cols-2 gap-12 pt-12 pb-6 text-xs print-break-inside-avoid">
        <div className="text-center space-y-1">
          <div className="border-t border-black w-60 mx-auto pt-1"></div>
          <p className="font-bold uppercase text-[11px]">CONTADOR PÚBLICO COLEGIADO</p>
          <p className="text-[10px] text-slate-500">C.P.C. N° _________ • Firma y Sello</p>
        </div>
        <div className="text-center space-y-1">
          <div className="border-t border-black w-60 mx-auto pt-1"></div>
          <p className="font-bold uppercase text-[11px]">{currentCompany.name}</p>
          <p className="text-[10px] text-slate-500">REPRESENTANTE LEGAL / ADMINISTRADOR</p>
        </div>
      </div>

      {/* Modal for adding adjustment entries */}
      <NewEntryModal
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
      />
    </div>
  );
};
