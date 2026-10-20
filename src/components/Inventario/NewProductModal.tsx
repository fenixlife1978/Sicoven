import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Package, X, Check } from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/formatters';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProductModal: React.FC<NewProductModalProps> = ({ isOpen, onClose }) => {
  const { currentCompany, addProduct } = useAccounting();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Mercancías Generales');
  const [unit, setUnit] = useState('Unidad');
  const [minStock, setMinStock] = useState<number>(10);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [avgCostBs, setAvgCostBs] = useState<number>(0);
  const [salesPriceBs, setSalesPriceBs] = useState<number>(0);

  if (!isOpen) return null;

  const bcvRate = currentCompany.bcvRate || 68.50;
  const avgCostUsd = bcvRate > 0 ? avgCostBs / bcvRate : 0;
  const salesPriceUsd = bcvRate > 0 ? salesPriceBs / bcvRate : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    addProduct({
      code: code.trim().toUpperCase(),
      name: name.trim().toUpperCase(),
      category: category.trim(),
      unit: unit.trim(),
      minStock: Number(minStock) || 0,
      currentStock: Number(currentStock) || 0,
      avgCostBs: Number(avgCostBs) || 0,
      avgCostUsd: Number(avgCostUsd.toFixed(2)),
      lastCostBs: Number(avgCostBs) || 0,
      lastCostUsd: Number(avgCostUsd.toFixed(2)),
      salesPriceBs: Number(salesPriceBs) || 0,
      salesPriceUsd: Number(salesPriceUsd.toFixed(2))
    });

    onClose();
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
              <label className="block font-semibold text-slate-700 mb-1">Existencia Inicial (Stock)</label>
              <input
                type="number"
                min="0"
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
