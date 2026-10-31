import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Check,
  X,
  FolderTree,
  Tag,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { Account, AccountType } from '../../types/accounting';

export const CatalogoView: React.FC = () => {
  const { accounts, addAccount } = useAccounting();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Account state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('ACTIVO');
  const [isMovement, setIsMovement] = useState(true);

  const filteredAccounts = accounts.filter(acc => {
    if (typeFilter !== 'ALL' && acc.type !== typeFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return acc.code.toLowerCase().includes(term) || acc.name.toLowerCase().includes(term);
    }
    return true;
  });

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    // determine level from code segments: e.g. "1" -> 1, "1.1" -> 2, "1.1.1" -> 3, "1.1.1.01" -> 4
    const level = code.split('.').length;

    addAccount({
      code: code.trim(),
      name: name.trim().toUpperCase(),
      type,
      level,
      isMovement
    });

    setIsModalOpen(false);
    setCode('');
    setName('');
  };

  const getTypeColor = (accType: AccountType) => {
    switch (accType) {
      case 'ACTIVO':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'PASIVO':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'PATRIMONIO':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'INGRESOS':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      case 'COSTOS':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'GASTOS':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Plan Único de Cuentas VEN-NIF
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-600">FCCPV Oficial</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Catálogo de Cuentas Contables
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Estructura codificada estándar de Activos, Pasivos, Patrimonio, Ingresos, Costos y Gastos.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nueva Cuenta
          </button>
        </div>

        {/* Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por código o denominación..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Todos los Grupos de Cuentas</option>
              <option value="ACTIVO">1 - Activo</option>
              <option value="PASIVO">2 - Pasivo</option>
              <option value="PATRIMONIO">3 - Patrimonio</option>
              <option value="INGRESOS">4 - Ingresos</option>
              <option value="COSTOS">5 - Costos</option>
              <option value="GASTOS">6 - Gastos Operacionales</option>
            </select>
          </div>

          <div className="flex items-center justify-end text-xs text-slate-500">
            <span>Total Cuentas: <strong className="text-slate-800">{filteredAccounts.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <th className="py-2.5 px-4 w-32">Código</th>
                <th className="py-2.5 px-4">Denominación de la Cuenta</th>
                <th className="py-2.5 px-4 w-32 text-center">Clasificación</th>
                <th className="py-2.5 px-4 w-28 text-center">Nivel</th>
                <th className="py-2.5 px-4 w-36 text-center">Tipo de Cuenta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map(acc => {
                const indentPadding = (acc.level - 1) * 1.5; // indentation
                const isGroup = !acc.isMovement;

                return (
                  <tr
                    key={acc.code}
                    className={`hover:bg-slate-50 transition ${
                      isGroup ? 'bg-slate-50/50 font-bold text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                      {acc.code}
                    </td>
                    <td className="py-2.5 px-4">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: `${indentPadding}rem` }}
                      >
                        {isGroup ? (
                          <FolderTree className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        )}
                        <span className={isGroup ? 'text-slate-900 tracking-wide' : 'text-slate-800 font-normal'}>
                          {acc.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getTypeColor(acc.type)}`}>
                        {acc.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono text-slate-500">
                      Nivel {acc.level}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {acc.isMovement ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Movimiento (Detalle)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded">
                          Totalizadora / Grupo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <h3 className="font-semibold text-base">Crear Cuenta Contable</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Código de Cuenta (Formato Jerárquico) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 1.1.1.06 o 6.1.1.11"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Denominación de la Cuenta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Gastos de Publicidad y Propaganda"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clasificación Principal</label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as AccountType)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="ACTIVO">1 - Activo</option>
                  <option value="PASIVO">2 - Pasivo</option>
                  <option value="PATRIMONIO">3 - Patrimonio</option>
                  <option value="INGRESOS">4 - Ingresos</option>
                  <option value="COSTOS">5 - Costos</option>
                  <option value="GASTOS">6 - Gastos</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMovement}
                    onChange={e => setIsMovement(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  ¿Es una cuenta de movimiento? (Acepta cargos y abonos en asientos)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Agregar al Catálogo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
