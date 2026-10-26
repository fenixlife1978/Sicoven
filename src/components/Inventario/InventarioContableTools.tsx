import React, { useMemo, useState } from 'react';
import { Download, FileUp, Scale, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import { calculateVnrWriteDown } from '../../types/inventoryAccounting';
import type { InventoryProduct } from '../../types/accounting';

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(value.trim()); value = ''; }
    else value += char;
  }
  fields.push(value.trim());
  return fields;
};

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
};

export const InventarioContableTools: React.FC = () => {
  const { currentCompany, products, movements, accounts, journalEntries, importInventoryProducts, updateProduct, addJournalEntry } = useAccounting();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [completionCost, setCompletionCost] = useState('0');
  const [sellingCost, setSellingCost] = useState('0');

  const selectedProduct = products.find(product => product.id === productId);
  const vnr = useMemo(() => {
    if (!selectedProduct) return null;
    try {
      return calculateVnrWriteDown({
        quantity: selectedProduct.currentStock,
        unitCostBs: selectedProduct.avgCostBs,
        estimatedSellingPricePerUnitBs: Number(sellingPrice),
        completionCostPerUnitBs: Number(completionCost),
        sellingCostPerUnitBs: Number(sellingCost)
      });
    } catch { return null; }
  }, [selectedProduct, sellingPrice, completionCost, sellingCost]);

  const handleImport = async (file?: File) => {
    if (!file) return;
    setError(''); setMessage(''); setImporting(true);
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) throw new Error('El CSV debe contener encabezados y al menos una fila.');
      const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
      const required = ['code', 'name', 'currentstock', 'avgcostbs'];
      if (required.some(h => !headers.includes(h))) {
        throw new Error('Faltan columnas obligatorias: code, name, currentStock y avgCostBs. Descargue la plantilla CSV.');
      }
      const rows = lines.slice(1).map((line, index) => {
        const cells = parseCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, i) => { row[header] = cells[i] ?? ''; });
        const numeric = (key: string, fallback = 0) => row[key] === '' || row[key] === undefined ? fallback : Number(row[key]);
        const method = row.costingmethod === 'PEPS' ? 'PEPS' : 'PROMEDIO_PONDERADO';
        const vat = ['GENERAL_16', 'REDUCIDA_8', 'EXENTO', 'EXONERADO'].includes(row.vattreatment || '') ? row.vattreatment as InventoryProduct['vatTreatment'] : 'GENERAL_16';
        const type = ['MERCANCIA', 'MATERIA_PRIMA', 'PRODUCTO_EN_PROCESO', 'PRODUCTO_TERMINADO', 'SUBPRODUCTO'].includes(row.itemtype || '') ? row.itemtype as InventoryProduct['itemType'] : 'MERCANCIA';
        if (!row.code?.trim() || !row.name?.trim()) throw new Error('Fila ' + (index + 2) + ': falta code o name.');
        return {
          code: row.code, name: row.name, category: row.category || 'General', unit: row.unit || 'Unidad',
          minStock: numeric('minstock'), currentStock: numeric('currentstock'), avgCostBs: numeric('avgcostbs'),
          avgCostUsd: 0, lastCostBs: numeric('avgcostbs'), lastCostUsd: 0, salesPriceBs: numeric('salespricebs'),
          salesPriceUsd: numeric('salespriceusd'), inventoryAccountCode: row.inventoryaccountcode || '1.1.4.01',
          costOfSalesAccountCode: row.costofsalesaccountcode || '5.1.1.01',
          adjustmentAccountCode: row.adjustmentaccountcode || '5.1.2.01',
          openingBalanceAccountCode: row.openingbalanceaccountcode || '3.3.1.01',
          costingMethod: method, vatTreatment: vat, itemType: type,
          openingDate: row.openingdate || new Date().toISOString().slice(0, 10),
          openingBcvRate: numeric('openingbcvrate', currentCompany.bcvRate)
        };
      });
      const imported = importInventoryProducts(rows);
      setMessage('Importación completada: ' + imported + ' artículos. Las existencias iniciales se registraron en Kardex y Libro Diario.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el CSV.');
    } finally { setImporting(false); }
  };

  const exportTemplate = () => downloadCsv('SICOVEN_Plantilla_Inventario.csv', [
    'code','name','category','unit','currentStock','avgCostBs','minStock','salesPriceBs','salesPriceUsd',
    'inventoryAccountCode','costOfSalesAccountCode','adjustmentAccountCode','openingBalanceAccountCode',
    'costingMethod','vatTreatment','itemType','openingDate','openingBcvRate'
  ], []);

  const exportInventory = () => downloadCsv('SICOVEN_Inventario_Valorado.csv', [
    'codigo','descripcion','tipo','unidad','existencia','metodo_costeo','costo_promedio_bs','provision_vnr_bs','valor_neto_bs',
    'costo_promedio_usd','valor_neto_usd','cuenta_inventario','cuenta_costo_ventas','iva','tasa_apertura_bcv'
  ], products.map(p => [
    p.code,p.name,p.itemType || 'MERCANCIA',p.unit,p.currentStock,p.costingMethod || 'PROMEDIO_PONDERADO',
    p.avgCostBs,p.vnrProvisionBs || 0,Math.max(0,p.currentStock*p.avgCostBs-(p.vnrProvisionBs || 0)),
    p.avgCostUsd,Math.max(0,p.currentStock*p.avgCostUsd-((p.vnrProvisionBs || 0)/(p.openingBcvRate || currentCompany.bcvRate))),
    p.inventoryAccountCode || '1.1.4.01',p.costOfSalesAccountCode || '5.1.1.01',p.vatTreatment || 'GENERAL_16',p.openingBcvRate || currentCompany.bcvRate
  ]));

  const exportBook = () => downloadCsv('SICOVEN_Libro_Entradas_Salidas.csv', [
    'fecha','tipo_documento','documento','rif_contraparte','contraparte','codigo','descripcion','concepto','tipo_movimiento',
    'entrada_cantidad','entrada_costo_unitario_bs','salida_cantidad','salida_costo_unitario_bs','existencia_final','valor_final_bs',
    'tasa_bcv_historica','entrada_usd','salida_usd','saldo_usd','cuenta_inventario'
  ], movements.slice().sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map(m => [
    m.date,m.documentType || '',m.documentRef,m.counterpartyRif || '',m.counterpartyName || '',m.productCode,m.productName,m.concept,m.type,
    m.type === 'ENTRADA' ? m.quantity : 0,m.type === 'ENTRADA' ? m.unitCostBs : 0,
    m.type === 'SALIDA' ? m.quantity : 0,m.type === 'SALIDA' ? m.unitCostBs : 0,m.balanceQty,m.balanceTotalBs,
    m.bcvRate || currentCompany.bcvRate,m.type === 'ENTRADA' ? m.totalCostUsd : 0,m.type === 'SALIDA' ? m.totalCostUsd : 0,m.balanceTotalUsd,
    products.find(p => p.id === m.productId)?.inventoryAccountCode || '1.1.4.01'
  ]));

  const recordVnr = () => {
    setError(''); setMessage('');
    if (!selectedProduct || !vnr) {
      setError('Seleccione un artículo e introduzca valores válidos para evaluar el VNR.');
      return;
    }
    try {
      const rate = Number(currentCompany.bcvRate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('La empresa no tiene una tasa BCV válida.');
      const oldProvision = Number(selectedProduct.vnrProvisionBs || 0);
      const delta = Math.round((vnr.writeDownBs - oldProvision) * 100) / 100;
      if (Math.abs(delta) < 0.01) {
        setMessage('La provisión registrada ya coincide con el cálculo VNR.');
        return;
      }
      const lossAccount = accounts.find(a => a.code === '5.1.2.02' && a.isMovement);
      const allowanceAccount = accounts.find(a => a.code === '1.1.4.03' && a.isMovement);
      if (!lossAccount || !allowanceAccount) throw new Error('Faltan las cuentas contables de desvalorización VNR.');
      const amountBs = Math.abs(delta);
      const amountUsd = Math.round(amountBs / rate * 100) / 100;
      const items = delta > 0 ? [
        { accountCode: lossAccount.code, accountName: lossAccount.name, debitBs: amountBs, creditBs: 0, debitUsd: amountUsd, creditUsd: 0, description: 'Pérdida por desvalorización VNR · ' + selectedProduct.code },
        { accountCode: allowanceAccount.code, accountName: allowanceAccount.name, debitBs: 0, creditBs: amountBs, debitUsd: 0, creditUsd: amountUsd, description: 'Provisión correctora VNR · ' + selectedProduct.code }
      ] : [
        { accountCode: allowanceAccount.code, accountName: allowanceAccount.name, debitBs: amountBs, creditBs: 0, debitUsd: amountUsd, creditUsd: 0, description: 'Reversión de provisión VNR · ' + selectedProduct.code },
        { accountCode: lossAccount.code, accountName: lossAccount.name, debitBs: 0, creditBs: amountBs, debitUsd: 0, creditUsd: amountUsd, description: 'Reversión de pérdida por desvalorización · ' + selectedProduct.code }
      ];
      addJournalEntry({
        entryNumber: 0, date: new Date().toISOString().slice(0,10),
        description: (delta > 0 ? 'Provisión' : 'Reversión') + ' por VNR de inventario · ' + selectedProduct.code,
        type: 'AJUSTE', bcvRate: rate, referenceDoc: 'VNR-' + selectedProduct.code + '-' + new Date().toISOString().slice(0,10), items
      });
      updateProduct({
        ...selectedProduct, vnrProvisionBs: vnr.writeDownBs,
        vnrEstimatedSellingPriceBs: Number(sellingPrice), vnrCompletionCostBs: Number(completionCost),
        vnrSellingCostBs: Number(sellingCost), vnrLastTestDate: new Date().toISOString().slice(0,10)
      });
      setMessage('Evaluación VNR registrada en el producto y en el Libro Diario.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar la provisión VNR.'); }
  };


  const closeInventoryPeriod = () => {
    setError(''); setMessage(''); setClosingBusy(true);
    try {
      if (!periodStart || !periodEnd || periodStart > periodEnd) throw new Error('Seleccione un período contable válido.');
      const rate = Number(closingRate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Introduzca la tasa BCV histórica correspondiente al cierre.');
      const reference = 'CIERRE-INVENTARIO-' + periodStart + '-' + periodEnd;
      if (journalEntries.some(entry => entry.referenceDoc === reference)) throw new Error('Este período ya tiene un asiento de cierre con esa referencia.');
      const groups = new Map<string, { inventoryCode: string; costCode: string; opening: number; purchases: number; closing: number }>();
      const entriesInPeriod = journalEntries.filter(entry => entry.date >= periodStart && entry.date <= periodEnd);
      for (const product of products) {
        const history = movements.filter(m => m.productId === product.id).slice().sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        if (product.currentStock > 0 && history.length === 0) throw new Error('El artículo ' + product.code + ' tiene existencia sin Kardex. Registre o importe su inventario inicial antes del cierre.');
        const before = history.filter(m => m.date < periodStart);
        const atEnd = history.filter(m => m.date <= periodEnd);
        const openingMovement = before.length ? before[before.length - 1] : null;
        const closingMovement = atEnd.length ? atEnd[atEnd.length - 1] : null;
        const opening = openingMovement ? Number(openingMovement.balanceTotalBs || 0) : 0;
        const closing = closingMovement ? Number(closingMovement.balanceTotalBs || 0) : 0;
        const purchasesInPeriod = history.filter(m => m.date >= periodStart && m.date <= periodEnd && m.type === 'ENTRADA' && ['COMPRA','DEVOLUCION_CLIENTE','INVENTARIO_INICIAL'].includes(m.concept))
          .reduce((sum,m) => sum + Number(m.totalCostBs || 0), 0)
          - history.filter(m => m.date >= periodStart && m.date <= periodEnd && m.type === 'SALIDA' && m.concept === 'DEVOLUCION_COMPRA')
          .reduce((sum,m) => sum + Number(m.totalCostBs || 0), 0);
        const inventoryCode = product.inventoryAccountCode || '1.1.4.01';
        const costCode = product.costOfSalesAccountCode || '5.1.1.01';
        const key = inventoryCode + '|' + costCode;
        const group = groups.get(key) || { inventoryCode, costCode, opening: 0, purchases: 0, closing: 0 };
        group.opening += opening; group.purchases += purchasesInPeriod; group.closing += closing;
        groups.set(key, group);
      }
      const items: Array<{accountCode:string;accountName:string;debitBs:number;creditBs:number;debitUsd:number;creditUsd:number;description:string}> = [];
      for (const group of groups.values()) {
        const expectedCogs = calculatePeriodicCostOfSales({
          openingInventoryBs: Math.max(0, group.opening),
          purchasesAndLandedCostsBs: Math.max(0, group.purchases),
          closingInventoryBs: Math.max(0, group.closing)
        });
        const costAccount = accounts.find(a => a.code === group.costCode && a.isMovement);
        const inventoryAccount = accounts.find(a => a.code === group.inventoryCode && a.isMovement);
        if (!costAccount || !inventoryAccount) throw new Error('Falta una cuenta contable válida para el par ' + group.inventoryCode + ' / ' + group.costCode + '.');
        const alreadyPosted = entriesInPeriod.filter(entry => entry.type === 'INVENTARIO' && entry.description.toLowerCase().includes('costo de venta'))
          .reduce((sum,entry) => sum + entry.items.filter(line => line.accountCode === group.costCode).reduce((subtotal,line) => subtotal + Number(line.debitBs || 0) - Number(line.creditBs || 0),0),0);
        const delta = Math.round((expectedCogs - alreadyPosted) * 100) / 100;
        if (Math.abs(delta) < 0.01) continue;
        const amount = Math.abs(delta);
        const usd = Math.round(amount / rate * 100) / 100;
        if (delta > 0) {
          items.push({ accountCode: costAccount.code, accountName: costAccount.name, debitBs: amount, creditBs: 0, debitUsd: usd, creditUsd: 0, description: 'Regularización costo de ventas por cierre de inventario' });
          items.push({ accountCode: inventoryAccount.code, accountName: inventoryAccount.name, debitBs: 0, creditBs: amount, debitUsd: 0, creditUsd: usd, description: 'Regularización inventario al cierre del período' });
        } else {
          items.push({ accountCode: inventoryAccount.code, accountName: inventoryAccount.name, debitBs: amount, creditBs: 0, debitUsd: usd, creditUsd: 0, description: 'Reversión de exceso de costo de ventas del período' });
          items.push({ accountCode: costAccount.code, accountName: costAccount.name, debitBs: 0, creditBs: amount, debitUsd: 0, creditUsd: usd, description: 'Reversión de exceso de costo de ventas del período' });
        }
      }
      if (!items.length) {
        setMessage('El período ' + periodStart + ' a ' + periodEnd + ' ya concilia con los costos de ventas contabilizados. No se generó un asiento duplicado.');
        return;
      }
      addJournalEntry({
        entryNumber: 0, date: periodEnd, description: 'Cierre y conciliación de inventario ' + periodStart + ' a ' + periodEnd,
        type: 'CIERRE', bcvRate: rate, referenceDoc: reference, items
      });
      setMessage('Cierre de inventario registrado y conciliado con los costos de ventas existentes. Referencia: ' + reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el inventario.');
    } finally { setClosingBusy(false); }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-700" /><h2 className="font-bold text-slate-900">Importación y exportación contable</h2></div>
      <p className="text-sm text-slate-600">Importe el inventario inicial desde CSV guardado por Excel. La importación valida códigos duplicados, tasas, costos y cuentas; si hay existencias iniciales, crea movimientos de apertura y sus asientos contables.</p>
      <div className="flex flex-wrap gap-2">
        <label className={'inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ' + (importing ? 'bg-slate-400' : 'bg-emerald-700 hover:bg-emerald-800')}>
          <FileUp className="h-4 w-4" />{importing ? 'Importando…' : 'Importar inventario CSV'}
          <input type="file" accept=".csv,.txt,text/csv" disabled={importing} className="hidden" onChange={e => { void handleImport(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <button onClick={exportTemplate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Descargar plantilla CSV</button>
        <button onClick={exportInventory} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Exportar inventario valorado</button>
        <button onClick={exportBook} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Exportar libro de entradas/salidas</button>
      </div>
      <p className="text-xs text-slate-500">La exportación contiene cantidades, costos, valores en Bs./USD, cuenta contable y tasa histórica del movimiento. El archivo CSV puede abrirse en Excel; la importación directa de archivos XLSX y conectores API se incorporarán en la siguiente fase.</p>
    </section>


    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2"><Scale className="h-5 w-5 text-emerald-700" /><h2 className="font-bold text-slate-900">Cierre y valoración periódica de inventario</h2></div>
      <p className="text-sm text-slate-600">Calcula el costo de ventas por artículo y cuentas asociadas a partir del Kardex histórico, descuenta el costo de ventas ya contabilizado y solo genera el asiento de ajuste que falte. El cierre se bloquea si detecta artículos con existencias sin trazabilidad.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Desde
          <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Hasta
          <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Tasa BCV histórica de cierre
          <input type="number" min="0.000001" step="0.000001" value={closingRate} onChange={e => setClosingRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
      </div>
      <button disabled={closingBusy || !products.length} onClick={closeInventoryPeriod} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{closingBusy ? 'Procesando cierre…' : 'Calcular, conciliar y registrar cierre'}</button>
      <p className="text-xs text-amber-800">El cálculo depende de que las compras, devoluciones, ajustes y salidas estén importados o registrados en el Kardex con fecha y costo correctos. El sistema no inventa movimientos faltantes.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2"><Scale className="h-5 w-5 text-indigo-700" /><h2 className="font-bold text-slate-900">Prueba del Valor Neto Realizable (NIC 2)</h2></div>
      <p className="text-sm text-slate-600">Compara el costo contable con el precio de venta estimado menos los costos de terminación y venta. Si el VNR es menor, calcula y registra la provisión contra la cuenta correctora del inventario.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Artículo
          <select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            {products.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Precio de venta estimado por unidad (Bs.)
          <input type="number" min="0" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Costo de terminación por unidad (Bs.)
          <input type="number" min="0" step="0.01" value={completionCost} onChange={e => setCompletionCost(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Costo de venta por unidad (Bs.)
          <input type="number" min="0" step="0.01" value={sellingCost} onChange={e => setSellingCost(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
      </div>
      {selectedProduct && vnr && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Valor en libros</span><strong className="block">{vnr.carryingValueBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs.</strong></div>
        <div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Valor neto realizable</span><strong className="block">{vnr.netRealizableValueBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs.</strong></div>
        <div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Provisión calculada</span><strong className="block">{vnr.writeDownBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs.</strong></div>
      </div>}
      {vnr?.required && <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />El VNR está por debajo del costo. Debe registrarse una provisión por desvalorización.</p>}
      <button disabled={!selectedProduct || !vnr || Math.abs(vnr.writeDownBs - Number(selectedProduct.vnrProvisionBs || 0)) < 0.01} onClick={recordVnr} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Registrar / actualizar provisión VNR</button>
    </section>
    {(message || error) && <p role={error ? 'alert' : 'status'} className={'rounded-lg p-3 text-sm ' + (error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800')}>{error || message}</p>}
  </div>;
};
