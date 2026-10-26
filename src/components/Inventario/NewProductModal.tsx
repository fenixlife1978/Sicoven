import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Package, X, Check } from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/formatters';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProductModal: React.FC<NewProductModalProps> = ({ isOpen, onClose }) => {
  const { currentCompany, addProduct, accounts } = useAccounting();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Mercancías Generales');
  const [unit, setUnit] = useState('Unidad');
  const [minStock, setMinStock] = useState<number>(10);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [openingBcvRateInput, setOpeningBcvRateInput] = useState(String(currentCompany.bcvRate || ''));
  const [avgCostBs, setAvgCostBs] = useState<number>(0);
  const [salesPriceBs, setSalesPriceBs] = useState<number>(0);
  const [inventoryAccountCode, setInventoryAccountCode] = useState('1.1.4.01');
  const [costOfSalesAccountCode, setCostOfSalesAccountCode] = useState('5.1.1.01');
  const [adjustmentAccountCode, setAdjustmentAccountCode] = useState('5.1.2.01');
  const [openingBalanceAccountCode, setOpeningBalanceAccountCode] = useState('3.3.1.01');
  const [costingMethod, setCostingMethod] = useState<'PROMEDIO_PONDERADO' | 'PEPS'>('PROMEDIO_PONDERADO');
  const [vatTreatment, setVatTreatment] = useState<'GENERAL_16' | 'REDUCIDA_8' | 'EXENTO' | 'EXONERADO'>('GENERAL_16');
  const [itemType, setItemType] = useState<'MERCANCIA' | 'MATERIA_PRIMA' | 'PRODUCTO_EN_PROCESO' | 'PRODUCTO_TERMINADO' | 'SUBPRODUCTO'>('MERCANCIA');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const bcvRate = Number(openingBcvRateInput);
  const avgCostUsd = bcvRate > 0 ? avgCostBs / bcvRate : 0;
  const salesPriceUsd = bcvRate > 0 ? salesPriceBs / bcvRate : 0;

  const movementAccounts = accounts.filter(account => account.isMovement);
  const inventoryAccounts = movementAccounts.filter(account => account.type === 'ACTIVO');
  const costAccounts = movementAccounts.filter(account => account.type === 'COSTOS' || account.type === 'GASTOS');
  const equityAccounts = movementAccounts.filter(account => account.type === 'PATRIMONIO');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim() || !name.trim()) { setError('El código y la descripción son obligatorios.'); return; }
    try {
    addProduct({
      code: code.trim().toUpperCase(),
      name: name.trim().toUpperCase(),
      category: category.trim(),
      unit: unit.trim(),
      minStock: Number(minStock) || 0,
      currentStock: Number(currentStock) || 0,
      avgCostBs: Number(avgCostBs) || 0,
      avgCostUsd,
      lastCostBs: Number(avgCostBs) || 0,
      lastCostUsd: avgCostUsd,
      salesPriceBs: Number(salesPriceBs) || 0,
      salesPriceUsd,
      inventoryAccountCode, costOfSalesAccountCode, adjustmentAccountCode, openingBalanceAccountCode,
      costingMethod, vatTreatment, itemType, openingDate, openingBcvRate: bcvRate
    });
    onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el artículo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Nuevo Artículo de Inventario</h3>
              <p className="text-xs text-slate-400">Control de existencias y costos bajo VEN-NIF NIC 2</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Código / SKU *</label>
              <input
                type="text"
                required
                placeholder="ART-001"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg uppercase font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Nombre del Producto *</label>
              <input
                type="text"
                required
                placeholder="Descripción completa del artículo..."
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de artículo contable</label>
              <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                <option value="MERCANCIA">Mercancía</option><option value="MATERIA_PRIMA">Materia prima</option><option value="PRODUCTO_EN_PROCESO">Producto en proceso</option><option value="PRODUCTO_TERMINADO">Producto terminado</option><option value="SUBPRODUCTO">Subproducto</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Método de costeo</label>
              <select value={costingMethod} onChange={e => setCostingMethod(e.target.value as typeof costingMethod)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                <option value="PROMEDIO_PONDERADO">Promedio ponderado</option><option value="PEPS">PEPS / FIFO</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tratamiento IVA</label>
              <select value={vatTreatment} onChange={e => setVatTreatment(e.target.value as typeof vatTreatment)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                <option value="GENERAL_16">General 16%</option><option value="REDUCIDA_8">Reducida 8%</option><option value="EXENTO">Exento</option><option value="EXONERADO">Exonerado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cuenta contable de inventario *</label>
              <select required value={inventoryAccountCode} onChange={e => setInventoryAccountCode(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                {inventoryAccounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cuenta de costo de ventas/consumo *</label>
              <select required value={costOfSalesAccountCode} onChange={e => setCostOfSalesAccountCode(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                {costAccounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cuenta de mermas y ajustes *</label>
              <select required value={adjustmentAccountCode} onChange={e => setAdjustmentAccountCode(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                {costAccounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </div>
            {Number(currentStock) > 0 && <div>
              <label className="block font-semibold text-slate-700 mb-1">Contrapartida de apertura *</label>
              <select required value={openingBalanceAccountCode} onChange={e => setOpeningBalanceAccountCode(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg">
                {equityAccounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
              <input
                type="text"
                placeholder="Alimentos, Repuestos, Insumos..."
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Unidad de Medida</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="Unidad">Unidad (Unid)</option>
                <option value="Caja">Caja</option>
                <option value="Bulto">Bulto</option>
                <option value="Kilogramo">Kilogramo (Kg)</option>
                <option value="Litro">Litro (Lt)</option>
                <option value="Metro">Metro (Mts)</option>
                <option value="Servicio">Servicio / Licencia</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha del inventario inicial</label>
              <input type="date" required value={openingDate} onChange={e => setOpeningDate(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tasa BCV histórica (Bs./USD) *</label>
              <input type="number" required min="0.000001" step="0.000001" value={openingBcvRateInput} onChange={e => setOpeningBcvRateInput(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Existencia Inicial (Stock)</label>
              <input
                type="number"
                min="0"
                step="0.000001"
                value={currentStock}
                onChange={e => setCurrentStock(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Stock Mínimo de Alerta</label>
              <input
                type="number"
                min="0"
                step="0.000001"
                value={minStock}
                onChange={e => setMinStock(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Costo Unitario (Bs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={avgCostBs || ''}
                placeholder="0.00"
                onChange={e => setAvgCostBs(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-500 font-mono">
                Equivalente: {formatUsd(avgCostUsd)}
              </span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Precio de Venta Sugerido (Bs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={salesPriceBs || ''}
                placeholder="0.00"
                onChange={e => setSalesPriceBs(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-500 font-mono">
                Equivalente: {formatUsd(salesPriceUsd)}
              </span>
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700">{error}</p>}

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Crear Artículo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
