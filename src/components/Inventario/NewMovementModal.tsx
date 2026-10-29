import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { ArrowLeftRight, X, Check } from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/formatters';

interface NewMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProductId?: string;
}

export const NewMovementModal: React.FC<NewMovementModalProps> = ({
  isOpen,
  onClose,
  defaultProductId
}) => {
  const { currentCompany, products, movements, purchases, journalEntries, addMovement } = useAccounting();

  const [productId, setProductId] = useState<string>(
    defaultProductId || products[0]?.id || ''
  );
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'ENTRADA' | 'SALIDA' | 'AJUSTE'>('ENTRADA');
  const [concept, setConcept] = useState<'COMPRA' | 'VENTA' | 'MERMA' | 'AJUSTE' | 'DEVOLUCION_COMPRA' | 'DEVOLUCION_CLIENTE' | 'AUTOCONSUMO' | 'INVENTARIO_INICIAL'>('COMPRA');
  const [correctionMovementId, setCorrectionMovementId] = useState('');
  const [documentRef, setDocumentRef] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitCostBs, setUnitCostBs] = useState<number>(0);
  const [additionalLandedCostsBs, setAdditionalLandedCostsBs] = useState<number>(0);
  const [bcvRateInput, setBcvRateInput] = useState(String(currentCompany.bcvRate || ''));
  const [documentType, setDocumentType] = useState('Factura de compra');
  const [counterpartyRif, setCounterpartyRif] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [error, setError] = useState('');

  const selectedProduct = products.find(p => p.id === productId) || products[0];
  const supplierReturnSources = movements.filter(m => m.companyId === currentCompany.id && m.productId === productId && m.type === 'ENTRADA' && m.concept === 'COMPRA' && !m.correctionForMovementId).map(m => ({...m, remaining: m.quantity - movements.filter(x => x.companyId === currentCompany.id && x.correctionForMovementId === m.id).reduce((sum,x)=>sum+Number(x.quantity||0),0)})).filter(m=>m.remaining>1e-8);
  const selectedReturnSource = supplierReturnSources.find(m=>m.id===correctionMovementId);

  // Auto-set cost when product changes
  React.useEffect(() => {
    if (selectedProduct) {
      setUnitCostBs(selectedProduct.avgCostBs || 0);
    }
  }, [productId, selectedProduct]);

  if (!isOpen || !selectedProduct) return null;

  const bcvRate = Number(bcvRateInput);
  const unitCostUsd = bcvRate > 0 ? unitCostBs / bcvRate : 0;
  const totalCostBs = type === 'ENTRADA'
    ? quantity * unitCostBs + additionalLandedCostsBs
    : type === 'SALIDA'
      ? quantity * selectedProduct.avgCostBs
      : Math.abs(quantity - selectedProduct.currentStock) * (quantity < selectedProduct.currentStock ? selectedProduct.avgCostBs : unitCostBs);
  const totalCostUsd = bcvRate > 0 ? totalCostBs / bcvRate : 0;

  // Compute prospective balance
  let balanceQty = selectedProduct.currentStock;
  if (type === 'ENTRADA') balanceQty += quantity;
  else if (type === 'SALIDA') balanceQty = Math.max(0, balanceQty - quantity);
  else balanceQty = quantity;

  const balanceTotalBs = balanceQty * unitCostBs;
  const balanceTotalUsd = bcvRate > 0 ? balanceTotalBs / bcvRate : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if ((type !== 'AJUSTE' && quantity <= 0) || (type === 'AJUSTE' && quantity < 0) || !Number.isFinite(bcvRate) || bcvRate <= 0) { setError('Verifique que la cantidad y la tasa BCV sean válidas.'); return; }
    if (type === 'SALIDA' && concept === 'DEVOLUCION_COMPRA') {
      if (!selectedReturnSource) { setError('Seleccione la entrada original de Kardex que se devuelve.'); return; }
      if (quantity > selectedReturnSource.remaining + 1e-8) { setError('La cantidad supera las unidades recibidas menos devoluciones previas (' + selectedReturnSource.remaining + ').'); return; }
      if (documentRef.trim().length < 4) { setError('Indique el número real de nota de crédito del proveedor o soporte autorizado (mínimo 4 caracteres).'); return; }
      if (selectedProduct.costingMethod === 'PEPS') { setError('La devolución con PEPS requiere identificar el lote de origen; permanece bloqueada hasta disponer de ese dato.'); return; }
      if (selectedProduct.currentStock + 1e-8 < quantity) { setError('No hay existencia suficiente para descargar la devolución física al proveedor.'); return; }
      if (Math.abs(Number(selectedProduct.avgCostBs || 0) - Number(selectedReturnSource.unitCostBs || 0)) > 0.01) { setError('El costo promedio actual difiere del costo de la entrada original. No se registró la devolución porque la contrapartida CxP podría no coincidir con la nota de crédito; requiere conciliación contable manual.'); return; }
      const linkedPurchase = purchases.find(p => p.companyId === currentCompany.id &&
        ('FAC-' + p.invoiceNumber).trim().toUpperCase() === selectedReturnSource.documentRef.trim().toUpperCase());
      const purchaseLine = linkedPurchase?.inventoryLines?.find(line => line.productId === selectedProduct.id &&
        Math.abs(Number(line.quantity)-Number(selectedReturnSource.quantity)) <= 1e-8 &&
        Math.abs(Number(line.unitCostBs)-Number(selectedReturnSource.unitCostBs)) <= 0.02);
      const purchaseJournal = linkedPurchase?.journalEntryId
        ? journalEntries.find(entry => entry.id === linkedPurchase.journalEntryId) : undefined;
      const journalInventoryDebit = purchaseJournal?.items.filter(item=>item.accountCode==='1.1.4.01')
        .reduce((sum,item)=>sum+Number(item.debitBs||0)-Number(item.creditBs||0),0);
      const expectedInventoryDebit = linkedPurchase
        ? Number(linkedPurchase.taxableBaseBs||0)+Number(linkedPurchase.exemptAmountBs||0) : 0;
      if (!linkedPurchase || !purchaseLine || !purchaseJournal ||
          !Number.isFinite(journalInventoryDebit) || Math.abs(Number(journalInventoryDebit)-expectedInventoryDebit)>0.02) {
        setError('Devolución bloqueada: no hay conciliación verificable entre la línea de compra, la entrada de Kardex y el débito de inventario del asiento original. Las facturas históricas sin líneas vinculadas requieren conciliación manual documentada.');
        return;
      }
      if (Number(linkedPurchase.vatAmountBs||0)>0 || Number(linkedPurchase.vatWithheldBs||0)>0 ||
          Number(linkedPurchase.islrWithheldBs||0)>0 || Number(linkedPurchase.igtfAmountBs||0)>0) {
        setError('Devolución bloqueada para esta factura: el flujo actual no calcula de forma completa la nota de crédito fiscal ni sus efectos en IVA, retenciones o IGTF. No se generó movimiento ni asiento parcial; requiere el flujo fiscal completo.');
        return;
      }
    }
    try {
    addMovement({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      productCode: selectedProduct.code,
      date,
      type,
      concept,
      documentRef: documentRef.trim() || `MOV-${Date.now().toString().slice(-6)}`,
      documentType, counterpartyRif: counterpartyRif.trim(), counterpartyName: counterpartyName.trim(), bcvRate,
      additionalLandedCostsBs: type === 'ENTRADA' ? additionalLandedCostsBs : 0,
      correctionForMovementId: type === 'SALIDA' && concept === 'DEVOLUCION_COMPRA' ? selectedReturnSource?.id : undefined,
      quantity,
      unitCostBs,
      unitCostUsd: Number(unitCostUsd.toFixed(2)),
      totalCostBs,
      totalCostUsd: Number(totalCostUsd.toFixed(2)),
      balanceQty,
      balanceTotalBs,
      balanceTotalUsd: Number(balanceTotalUsd.toFixed(2))
    });

    onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Registrar Movimiento en Kardex</h3>
              <p className="text-xs text-slate-400">Control de Entradas y Salidas de Inventario</p>
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
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Producto / Artículo *</label>
            <select
              value={productId}
              onChange={e => { setProductId(e.target.value); setCorrectionMovementId(''); }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name} (Stock: {p.currentStock} {p.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Movimiento</label>
              <select
                value={type}
                onChange={e => {
                  const val = e.target.value as any;
                  setType(val);
                  setCorrectionMovementId('');
                  if (val === 'ENTRADA') setConcept('COMPRA');
                  else if (val === 'SALIDA') setConcept('VENTA');
                  else setConcept('AJUSTE');
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="ENTRADA">Entrada (Aumento Stock)</option>
                <option value="SALIDA">Salida (Descargo / Venta)</option>
                <option value="AJUSTE">Ajuste de Inventario Físico</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Concepto</label>
              <select
                value={concept}
                onChange={e => setConcept(e.target.value as any)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                {type === 'ENTRADA' && (
                  <>
                    <option value="COMPRA">Compra Nacional</option>
                    <option value="DEVOLUCION_CLIENTE">Devolución de cliente</option>
                    <option value="INVENTARIO_INICIAL">Inventario Inicial</option>
                  </>
                )}
                {type === 'SALIDA' && (
                  <>
                    <option value="VENTA">Venta de Mercancía</option>
                    <option value="DEVOLUCION_COMPRA">Devolución a proveedor</option>
                    <option value="AUTOCONSUMO">Autoconsumo</option>
                    <option value="MERMA">Merma / Deterioro</option>
                  </>
                )}
                {type === 'AJUSTE' && (
                  <>
                    <option value="AJUSTE">Ajuste Físico</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {type === 'SALIDA' && concept === 'DEVOLUCION_COMPRA' && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3">
            <div className="font-bold text-amber-950">Conciliación obligatoria de devolución a proveedor</div>
            <p className="text-amber-900">Seleccione la entrada original del Kardex y registre la referencia de la nota de crédito del proveedor. La cantidad se limita a las unidades recibidas menos devoluciones previas; el asiento de salida afecta CxP e inventario. Esto no sustituye el documento fiscal válido.</p>
            <div><label className="block font-semibold text-slate-700 mb-1">Entrada original de compra *</label><select required value={correctionMovementId} onChange={e=>{setCorrectionMovementId(e.target.value);const source=supplierReturnSources.find(m=>m.id===e.target.value);if(source){setUnitCostBs(source.unitCostBs);setCounterpartyRif(source.counterpartyRif||'');setCounterpartyName(source.counterpartyName||'');setDocumentType('Nota de crédito proveedor');}}} className="w-full rounded-lg border border-slate-300 p-2"><option value="">Seleccionar factura / entrada de Kardex…</option>{supplierReturnSources.map(m=><option key={m.id} value={m.id}>{m.date} · {m.documentRef} · {m.productCode} · recibidas {m.quantity} · pendientes {m.remaining}</option>)}</select></div>
            {selectedReturnSource && <p className="text-xs text-slate-700">Pendiente máximo: <strong>{selectedReturnSource.remaining}</strong> unidades · costo original: <strong>{formatBs(selectedReturnSource.unitCostBs)}</strong> por unidad.</p>}
            <div><label className="block font-semibold text-slate-700 mb-1">N.º nota de crédito / soporte autorizado *</label><input required minLength={4} value={documentRef} onChange={e=>setDocumentRef(e.target.value)} placeholder="NC proveedor / documento real" className="w-full rounded-lg border border-slate-300 p-2"/></div>
            {selectedProduct.costingMethod === 'PEPS' && <p className="text-rose-700 font-semibold">PEPS: bloqueado hasta identificar el lote de origen.</p>}
          </div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo y número de documento</label>
              <select value={documentType} onChange={e => setDocumentType(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg">
                <option>Factura de compra</option><option>Factura de venta</option><option>Nota de débito</option><option>Nota de crédito</option><option>Nota de crédito proveedor</option><option>Guía de despacho</option><option>Acta de ajuste</option><option>Inventario inicial</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tasa BCV histórica (Bs./USD) *</label>
              <input type="number" min="0.000001" step="0.000001" required value={bcvRateInput} onChange={e => setBcvRateInput(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">RIF proveedor / cliente</label>
              <input value={counterpartyRif} onChange={e => setCounterpartyRif(e.target.value)} maxLength={20} placeholder="J-12345678-9" className="w-full px-3 py-1.5 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proveedor / cliente</label>
              <input value={counterpartyName} onChange={e => setCounterpartyName(e.target.value)} maxLength={180} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">N° Documento Ref.</label>
              <input
                type="text"
                placeholder="FAC-00012, DESP-004"
                value={documentRef}
                onChange={e => setDocumentRef(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cantidad ({selectedProduct.unit}) *
              </label>
              <input
                type="number"
                min={type === 'AJUSTE' ? 0 : 0.000001}
                step="0.000001"
                required
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Costo Unitario (Bs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={unitCostBs || ''}
                onChange={e => setUnitCostBs(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          {type === 'ENTRADA' && <div>
            <label className="block font-semibold text-slate-700 mb-1">Fletes y gastos de nacionalización asignados a esta entrada (Bs.)</label>
            <input type="number" min="0" step="0.01" value={additionalLandedCostsBs || ''} onChange={e => setAdditionalLandedCostsBs(parseFloat(e.target.value) || 0)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono" />
            <p className="mt-1 text-[11px] text-slate-500">Estos costos se distribuyen sobre la cantidad recibida y se capitalizan en el costo unitario del artículo.</p>
          </div>}

          {/* Movement summary pill */}
          <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">Total estimado del movimiento:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {formatBs(totalCostBs)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Stock Resultante:</span>
              <span className="font-mono font-bold text-white text-sm">
                {balanceQty} {selectedProduct.unit}
              </span>
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</p>}

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
              Procesar Movimiento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
