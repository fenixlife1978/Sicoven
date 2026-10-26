import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  Package,
  Plus,
  ArrowLeftRight,
  Printer,
  Search,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import { NewProductModal } from './NewProductModal';
import { NewMovementModal } from './NewMovementModal';
import { CompanyLogoHeader } from '../CompanyLogoHeader';
import { InventarioContableTools } from './InventarioContableTools';

export const InventarioView: React.FC = () => {
  const { currentCompany, products, movements } = useAccounting();

  const [activeTab, setActiveTab] = useState<'EXISTENCIAS' | 'KARDEX' | 'CONTABILIDAD'>('EXISTENCIAS');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');

  // Filter products
  const filteredProducts = products.filter(p => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Filter movements
  const filteredMovements = movements
    .filter(m => {
      if (selectedProductId !== 'ALL' && m.productId !== selectedProductId) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          m.productName.toLowerCase().includes(term) ||
          m.productCode.toLowerCase().includes(term) ||
          m.documentRef.toLowerCase().includes(term)
        );
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Valuations
  const totalInventoryValueBs = products.reduce(
    (sum, p) => sum + Math.max(0, p.currentStock * p.avgCostBs - Number(p.vnrProvisionBs || 0)),
    0
  );
  const totalInventoryValueUsd = products.reduce(
    (sum, p) => sum + Math.max(0, p.currentStock * p.avgCostUsd - Number(p.vnrProvisionBs || 0) / Math.max(Number(currentCompany.bcvRate || 0), 0.000001)),
    0
  );
  const lowStockCount = products.filter(p => p.currentStock <= p.minStock).length;

  return (
    <div className="space-y-6">
      {/* Official Header with Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle="Control de Inventarios y Kardex Valorado"
          subtitle="Valuación por Método de Costo Promedio Ponderado bajo Normas VEN-NIF NIC 2"
          periodText={`Al ${new Date().toLocaleDateString('es-VE')}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Artículos: <strong className="text-slate-900">{products.length}</strong></span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">Kardex Perpetuo Activo</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              onClick={() => setIsMovementModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition cursor-pointer border border-emerald-200"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Nuevo Movimiento
            </button>
            <button
              onClick={() => setIsProductModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Crear Artículo
            </button>
          </div>
        </div>

        {/* Inventory Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
              Valoración Total del Inventario
            </span>
            <div className="text-lg font-bold font-mono text-emerald-700 mt-1">
              {formatBs(totalInventoryValueBs)}
            </div>
            <div className="text-xs font-mono text-slate-500">
              {formatUsd(totalInventoryValueUsd)}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
              Artículos en Catálogo
            </span>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {products.length} productos
            </div>
            <div className="text-xs text-slate-500">
              {movements.length} movimientos registrados en Kardex
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
              Alertas de Stock
            </span>
            <div className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${
              lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {lowStockCount > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  {lowStockCount} artículos bajo mínimo
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Stock óptimo en todos los artículos
                </>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Supervisión de reposición
            </div>
          </div>
        </div>

        {/* View Switcher & Search (no-print) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-6 border-t border-slate-200 mt-6 no-print">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('EXISTENCIAS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'EXISTENCIAS'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Catálogo de Existencias ({products.length})
            </button>
            <button
              onClick={() => setActiveTab('KARDEX')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'KARDEX'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Kardex de Movimientos ({movements.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar artículo o código..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button onClick={() => setActiveTab('CONTABILIDAD')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100">Herramientas contables</button>

            {activeTab === 'KARDEX' && (
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="ALL">Todos los Artículos</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'CONTABILIDAD' && <InventarioContableTools />}

      {/* 1. Existencias Table */}
      {activeTab === 'EXISTENCIAS' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold whitespace-nowrap">
                  <th className="py-2.5 px-4 w-28">Código SKU</th>
                  <th className="py-2.5 px-4">Descripción del Artículo</th>
                  <th className="py-2.5 px-4 w-32">Categoría</th>
                  <th className="py-2.5 px-3 w-20 text-center">Unidad</th>
                  <th className="py-2.5 px-4 text-right w-24">Existencia</th>
                  <th className="py-2.5 px-4 text-right w-32">Costo Promedio (Bs. / USD)</th>
                  <th className="py-2.5 px-4 text-right w-32">Precio Venta (Bs. / USD)</th>
                  <th className="py-2.5 px-4 text-right w-36">Valoración Total (Bs. / USD)</th>
                  <th className="py-2.5 px-3 text-center w-28">Estado Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No hay artículos de inventario registrados.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(prod => {
                    const totalValBs = Math.max(0, prod.currentStock * prod.avgCostBs - Number(prod.vnrProvisionBs || 0));
                    const totalValUsd = Math.max(0, prod.currentStock * prod.avgCostUsd - Number(prod.vnrProvisionBs || 0) / Math.max(Number(currentCompany.bcvRate || 0), 0.000001));
                    const isLow = prod.currentStock <= prod.minStock;

                    return (
                      <tr key={prod.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                          {prod.code}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {prod.name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {prod.category}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                          {prod.unit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          {prod.currentStock}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                          {formatBs(prod.avgCostBs)}
                          {true && (
                            <span className="block text-[10px] text-slate-400">{formatUsd(prod.avgCostUsd)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700">
                          {formatBs(prod.salesPriceBs)}
                          {displayCurrency !== 'BS' && (
                            <span className="block text-[10px] text-emerald-600/70">{formatUsd(prod.salesPriceUsd)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900 bg-slate-50/50">
                          {formatBs(totalValBs)}
                          {displayCurrency !== 'BS' && (
                            <span className="block text-[10px] text-slate-400 font-normal">{formatUsd(totalValUsd)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              <AlertTriangle className="w-3 h-3" />
                              Bajo Mínimo ({prod.minStock})
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Normal
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Kardex Table */}
      {activeTab === 'KARDEX' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold whitespace-nowrap">
                  <th className="py-2.5 px-4 w-24">Fecha</th>
                  <th className="py-2.5 px-4 w-28">Código</th>
                  <th className="py-2.5 px-4">Artículo</th>
                  <th className="py-2.5 px-3 w-28 text-center">Tipo</th>
                  <th className="py-2.5 px-3 w-28">Concepto</th>
                  <th className="py-2.5 px-3 w-28">Documento Ref.</th>
                  <th className="py-2.5 px-4 text-right w-24">Cantidad</th>
                  <th className="py-2.5 px-4 text-right w-28">Costo Unit. (Bs.)</th>
                  <th className="py-2.5 px-4 text-right w-32">Total Movimiento</th>
                  <th className="py-2.5 px-4 text-right w-28 font-bold">Saldo Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      No hay movimientos de kardex registrados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map(mov => {
                    const isEntrada = mov.type === 'ENTRADA';
                    const isSalida = mov.type === 'SALIDA';

                    return (
                      <tr key={mov.id} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-4 font-mono text-slate-600 whitespace-nowrap">
                          {formatDate(mov.date)}
                        </td>
                        <td className="py-2 px-4 font-mono font-medium text-slate-700">
                          {mov.productCode}
                        </td>
                        <td className="py-2 px-4 font-medium text-slate-900 truncate max-w-xs">
                          {mov.productName}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isEntrada ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              <ArrowDownRight className="w-3 h-3" />
                              Entrada
                            </span>
                          ) : isSalida ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                              <ArrowUpRight className="w-3 h-3" />
                              Salida
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              Ajuste
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-medium">
                          {mov.concept}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {mov.documentRef}
                        </td>
                        <td className={`py-2 px-4 text-right font-mono font-bold ${
                          isEntrada ? 'text-emerald-700' : isSalida ? 'text-rose-700' : 'text-slate-800'
                        }`}>
                          {isEntrada ? `+${mov.quantity}` : isSalida ? `-${mov.quantity}` : mov.quantity}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-slate-700">
                          {formatBs(mov.unitCostBs)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-slate-900">
                          {formatBs(mov.totalCostBs)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                          {mov.balanceQty}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <NewProductModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} />
      <NewMovementModal isOpen={isMovementModalOpen} onClose={() => setIsMovementModalOpen(false)} />
    </div>
  );
};
