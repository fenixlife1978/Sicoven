import React, { useMemo, useState } from 'react';
import { normalizeMigrationValue, parseDelimitedRecords, parseMigrationNumber } from '../../types/migrationParsing';
import ExcelJS from 'exceljs';
import { FileUp, Search, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Files, ArrowRightLeft } from 'lucide-react';

type Row = Record<string, unknown>;
type Status = 'complete' | 'partial' | 'blocked';
type ModuleKey = 'inventory' | 'customers' | 'suppliers' | 'receivables' | 'payables' | 'sales' | 'purchases' | 'accounts' | 'journal' | 'banks' | 'retentions' | 'assets';
type Detection = { key: ModuleKey; name: string; fields: string[]; rows: Row[]; status: Status; missing: string[]; notes: string[]; selected: boolean; source: string };
type ParsedFile = { name: string; rows: Row[]; error?: string };

const MODULES: { key: ModuleKey; name: string; aliases: Record<string, string[]>; required: string[][] }[] = [
  { key: 'inventory', name: 'Inventario / productos', aliases: { code: ['code','codigo','sku','itemcode','codarticulo'], name: ['name','nombre','descripcion','producto','articulo'], stock: ['currentstock','stock','existencia','cantidad','qty'], cost: ['avgcostbs','costobs','costo','costounitario','unitcost'] }, required: [['code','codigo','sku','itemcode','codarticulo'], ['name','nombre','descripcion','producto','articulo']] },
  { key: 'customers', name: 'Clientes', aliases: { id: ['rif','documento','identificacion','taxid','customerid'], name: ['nombre','razonsocial','cliente','customername','name'] }, required: [['rif','documento','identificacion','taxid','customerid'], ['nombre','razonsocial','cliente','customername','name']] },
  { key: 'suppliers', name: 'Proveedores', aliases: { id: ['rif','documento','identificacion','taxid','supplierid'], name: ['nombre','razonsocial','proveedor','suppliername','name'] }, required: [['rif','documento','identificacion','taxid','supplierid'], ['nombre','razonsocial','proveedor','suppliername','name']] },
  { key: 'receivables', name: 'Cuentas por cobrar', aliases: { party: ['cliente','customer','customername','clienterif','rifcliente'], doc: ['factura','documento','invoice','invoicenumber','referencia'], amount: ['saldo','saldoactual','monto','importe','balance','amount'], date: ['fecha','fechavencimiento','duedate','date'] }, required: [['cliente','customer','customername','clienterif','rifcliente'], ['factura','documento','invoice','invoicenumber','referencia'], ['saldo','saldoactual','monto','importe','balance','amount']] },
  { key: 'payables', name: 'Cuentas por pagar', aliases: { party: ['proveedor','supplier','suppliername','proveedorrif','rifproveedor'], doc: ['factura','documento','invoice','invoicenumber','referencia'], amount: ['saldo','saldoactual','monto','importe','balance','amount'], date: ['fecha','fechavencimiento','duedate','date'] }, required: [['proveedor','supplier','suppliername','proveedorrif','rifproveedor'], ['factura','documento','invoice','invoicenumber','referencia'], ['saldo','saldoactual','monto','importe','balance','amount']] },
  { key: 'sales', name: 'Ventas / facturas', aliases: { doc: ['factura','numerofactura','invoicenumber','documento'], date: ['fecha','fechafactura','invoicedate','date'], party: ['cliente','customername','clienterif','customerrif'], total: ['total','totalbs','monto','totalamountbs'] }, required: [['factura','numerofactura','invoicenumber','documento'], ['fecha','fechafactura','invoicedate','date'], ['total','totalbs','monto','totalamountbs']] },
  { key: 'purchases', name: 'Compras / facturas', aliases: { doc: ['factura','numerofactura','invoicenumber','documento'], date: ['fecha','fechafactura','invoicedate','date'], party: ['proveedor','suppliername','proveedorif','supplierrif'], total: ['total','totalbs','monto','totalamountbs'] }, required: [['factura','numerofactura','invoicenumber','documento'], ['fecha','fechafactura','invoicedate','date'], ['total','totalbs','monto','totalamountbs']] },
  { key: 'accounts', name: 'Plan de cuentas', aliases: { code: ['codigo','code','cuenta','accountcode'], name: ['nombre','descripcion','name','accountname'], type: ['tipo','type','clasificacion'] }, required: [['codigo','code','cuenta','accountcode'], ['nombre','descripcion','name','accountname']] },
  { key: 'journal', name: 'Asientos contables', aliases: { date: ['fecha','date'], account: ['cuenta','accountcode','codigocuenta'], debit: ['debito','debe','debit','debitbs'], credit: ['credito','haber','credit','creditbs'], ref: ['referencia','comprobante','numeroasiento','entrynumber'] }, required: [['fecha','date'], ['cuenta','accountcode','codigocuenta'], ['debito','debe','debit','debitbs'], ['credito','haber','credit','creditbs']] },
  { key: 'banks', name: 'Bancos / movimientos', aliases: { date: ['fecha','date'], ref: ['referencia','reference','numero'], amount: ['monto','importe','amount','montobs'], bank: ['banco','bank','cuenta'] }, required: [['fecha','date'], ['monto','importe','amount','montobs']] },
  { key: 'retentions', name: 'Retenciones fiscales', aliases: { doc: ['comprobante','numerocomprobante','vouchernumber','factura'], date: ['fecha','date','periodo'], amount: ['retenido','montoretencion','withheldamountbs','monto'] }, required: [['comprobante','numerocomprobante','vouchernumber','factura'], ['fecha','date','periodo'], ['retenido','montoretencion','withheldamountbs','monto']] },
  { key: 'assets', name: 'Activos fijos', aliases: { code: ['codigo','code','assetid'], name: ['nombre','descripcion','activo','name'], cost: ['costo','cost','costobs','valorhistorico'], date: ['fechaadquisicion','fecha','acquisitiondate'] }, required: [['codigo','code','assetid'], ['nombre','descripcion','activo','name'], ['costo','cost','costobs','valorhistorico']] }
];

const normalize = normalizeMigrationValue;
const asRows = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data.filter(x => x && typeof x === 'object' && !Array.isArray(x)) as Row[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['rows','data','items','records','productos','products','clientes','customers','proveedores','suppliers']) {
      if (Array.isArray(obj[key])) return (obj[key] as unknown[]).filter(x => x && typeof x === 'object' && !Array.isArray(x)) as Row[];
    }
  }
  return [];
};
const csvRows = (text: string): Row[] => parseDelimitedRecords(text);

async function parseFile(file: File): Promise<ParsedFile[]> {
  try {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'json') {
      const rows = asRows(JSON.parse(await file.text()));
      return [{ name: file.name, rows, ...(rows.length ? {} : { error: 'El JSON no contiene registros en un arreglo reconocido.' }) }];
    }
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const rows = csvRows(await file.text());
      return [{ name: file.name, rows, ...(rows.length ? {} : { error: 'No se detectaron filas de datos o encabezados suficientes.' }) }];
    }
    if (ext === 'xlsx' || ext === 'xlsm') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      if (!workbook.worksheets.length) return [{ name: file.name, rows: [], error: 'El libro no contiene hojas.' }];
      return workbook.worksheets.map(sheet => {
        const matrix: unknown[][] = [];
        sheet.eachRow({ includeEmpty: false }, row => {
          const values: unknown[] = [];
          for (let col = 1; col <= row.cellCount; col++) {
            const value = row.getCell(col).value;
            if (value instanceof Date) values.push(value.toISOString().slice(0, 10));
            else if (value && typeof value === 'object' && 'text' in value) values.push((value as { text: unknown }).text);
            else if (value && typeof value === 'object' && 'result' in value) values.push((value as { result: unknown }).result);
            else values.push(value);
          }
          matrix.push(values);
        });
        if (matrix.length < 2) return { name: file.name + ' — hoja: ' + sheet.name, rows: [], error: 'La hoja no contiene encabezados y filas de datos.' };
        const headers = matrix[0].map((value, index) => String(value ?? '').trim() || 'columna_' + (index + 1));
        const rows = matrix.slice(1).map(values => {
          const item: Row = {};
          headers.forEach((header, index) => { item[header] = values[index] ?? ''; });
          return item;
        }).filter(item => Object.values(item).some(value => String(value ?? '').trim() !== ''));
        return { name: file.name + ' — hoja: ' + sheet.name, rows, ...(rows.length ? {} : { error: 'La hoja no contiene registros de datos.' }) };
      });
    }
    return [{ name: file.name, rows: [], error: 'Formato no admitido. Use JSON, CSV, TSV, TXT o Excel XLSX/XLSM.' }];
  } catch (e) {
    return [{ name: file.name, rows: [], error: e instanceof Error ? e.message : 'No se pudo interpretar el archivo.' }];
  }
}

export const MigracionInteligente: React.FC = () => {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [planNote, setPlanNote] = useState('');

  const detections = useMemo<Detection[]>(() => {
    const all: Detection[] = [];
    for (const file of files) {
      if (file.error || !file.rows.length) continue;
      const fields = [...new Set(file.rows.flatMap(row => Object.keys(row).map(normalize)))];
      for (const mod of MODULES) {
        const matches = mod.required.map(group => group.some(alias => fields.includes(normalize(alias))));
        // No clasificar módulos por encabezados genéricos compartidos como "nombre", "fecha" o "monto".
        // Se requieren al menos dos grupos de campos o una señal específica del módulo.
        const strongSignals: Partial<Record<ModuleKey, string[]>> = {
          inventory: ['sku','itemcode','codarticulo','existencia','currentstock'],
          customers: ['customerid','clienterif','rifcliente','identificacion','taxid'],
          suppliers: ['supplierid','suppliername','supplierif','supplierRif','rifproveedor','proveedorrif'],
          receivables: ['clienterif','rifcliente','customername','customer'],
          payables: ['suppliername','supplierrif','rifproveedor','proveedorrif'],
          sales: ['invoicenumber','numerofactura','customerrif','customername'],
          purchases: ['invoicenumber','numerofactura','supplierrif','suppliername'],
          accounts: ['accountcode','accountname','clasificacion'],
          journal: ['accountcode','codigocuenta','debitbs','creditbs','debe','haber'],
          banks: ['bank','banco','bankaccount','referencia','reference'],
          retentions: ['vouchernumber','numerocomprobante','montoretencion','withheldamountbs'],
          assets: ['assetid','fechaadquisicion','valorhistorico']
        };
        const hasStrongSignal = (strongSignals[mod.key] || []).some(alias => fields.includes(normalize(alias)));
        if (matches.filter(Boolean).length < 2 && !hasStrongSignal) continue;
        const missing = mod.required.filter((group,i) => !matches[i]).map(group => group[0]);
        const rows = file.rows;
        const notes: string[] = [];
        if (mod.key === 'journal') {
          const findRaw = (row: Row, aliases: string[]) => {
            const key = Object.keys(row).find(k => aliases.includes(normalize(k)));
            return key ? row[key] : undefined;
          };
          const referenceAliases = ['referencia','comprobante','numeroasiento','entrynumber','asiento','journalid','id'];
          const grouped = new Map<string, { debit: number; credit: number; invalid: boolean; rows: number }>();
          rows.forEach((row, index) => {
            const referenceKey = Object.keys(row).find(k => referenceAliases.includes(normalize(k)));
            const reference = referenceKey ? String(row[referenceKey] ?? '').trim() : '';
            const groupKey = reference || '__fila_' + (index + 1);
            const group = grouped.get(groupKey) || { debit: 0, credit: 0, invalid: false, rows: 0 };
            const debitRaw = findRaw(row, mod.aliases.debit);
            const creditRaw = findRaw(row, mod.aliases.credit);
            const hasDebit = debitRaw !== undefined && String(debitRaw).trim() !== '';
            const hasCredit = creditRaw !== undefined && String(creditRaw).trim() !== '';
            const parsedDebit = hasDebit ? parseMigrationNumber(debitRaw) : 0;
            const parsedCredit = hasCredit ? parseMigrationNumber(creditRaw) : 0;
            const invalidLine = (!hasDebit && !hasCredit) ||
              (hasDebit && !Number.isFinite(parsedDebit)) ||
              (hasCredit && !Number.isFinite(parsedCredit)) ||
              (Number.isFinite(parsedDebit) && parsedDebit < 0) ||
              (Number.isFinite(parsedCredit) && parsedCredit < 0) ||
              (parsedDebit > 0 && parsedCredit > 0) ||
              (parsedDebit === 0 && parsedCredit === 0);
            group.debit += Number.isFinite(parsedDebit) ? parsedDebit : 0;
            group.credit += Number.isFinite(parsedCredit) ? parsedCredit : 0;
            group.invalid = group.invalid || invalidLine;
            group.rows += 1;
            grouped.set(groupKey, group);
          });
          const invalidGroups = [...grouped.values()].filter(group => group.invalid).length;
          const unbalanced = [...grouped.entries()].filter(([, group]) => !group.invalid && Math.abs(group.debit - group.credit) > 0.01);
          if (invalidGroups) notes.push('BLOQUEO: hay líneas contables sin importes, con importes inválidos/negativos o con debe y haber simultáneos en ' + invalidGroups + ' asiento(s)/grupo(s).');
          if (unbalanced.length) notes.push('BLOQUEO: ' + unbalanced.length + ' asiento(s) no cuadran individualmente. Diferencias: ' + unbalanced.slice(0, 5).map(([ref, group]) => ref + ': ' + (group.debit - group.credit).toFixed(2)).join('; ') + (unbalanced.length > 5 ? '; …' : ''));
          if (!invalidGroups && !unbalanced.length) notes.push('Cada grupo identificado cuadra en débitos/créditos; aún deben validarse las cuentas de movimiento, fechas, referencias y duplicados.');
          if (!rows.some(row => Object.keys(row).some(k => referenceAliases.includes(normalize(k))))) {
            notes.push('ADVERTENCIA: no se detectó identificador de asiento; se validó cada fila por separado y no se puede confirmar integridad por asiento.');
          }
        }
        const identityAliases: Partial<Record<ModuleKey, string[]>> = {
          inventory: ['code','codigo','sku','itemcode','codarticulo'],
          customers: ['rif','documento','identificacion','taxid','customerid'],
          suppliers: ['rif','documento','identificacion','taxid','supplierid'],
          receivables: ['invoice','invoicenumber','factura','documento','referencia'],
          payables: ['invoice','invoicenumber','factura','documento','referencia'],
          sales: ['invoice','invoicenumber','factura','numerofactura','documento'],
          purchases: ['invoice','invoicenumber','factura','numerofactura','documento'],
          accounts: ['codigo','code','cuenta','accountcode'],
          banks: ['referencia','reference','numero'],
          retentions: ['comprobante','numerocomprobante','vouchernumber'],
          assets: ['codigo','code','assetid']
        };
        const identity = identityAliases[mod.key] || [];
        if (identity.length) {
          const rowKeys = rows.map(row => {
            const key = Object.keys(row).find(k => identity.includes(normalize(k)));
            return key ? normalize(row[key]) : '';
          }).filter(Boolean);
          const duplicateCount = rowKeys.length - new Set(rowKeys).size;
          if (duplicateCount) {
            const strictUniqueKeys: ModuleKey[] = ['inventory', 'customers', 'suppliers', 'accounts', 'retentions', 'assets'];
            if (strictUniqueKeys.includes(mod.key)) {
              notes.push('BLOQUEO: posibles duplicados por identificador único detectado: ' + duplicateCount + '.');
            } else {
              notes.push('ADVERTENCIA: se repite un número de documento/referencia (' + duplicateCount + ' repetición(es)). Puede tratarse de partidas de una misma factura; verifica la vista previa antes de autorizar.');
            }
          }
        }
        if (missing.length) notes.push('Detección parcial: faltan campos obligatorios para este módulo.');
        if (mod.key !== 'journal') notes.push('La detección de columnas no sustituye la validación de relaciones y saldos antes de escribir.');
        const blocked = notes.some(note => note.startsWith('BLOQUEO:'));
        all.push({ key: mod.key, name: mod.name, fields, rows, status: blocked ? 'blocked' : missing.length ? 'partial' : 'complete', missing, notes, selected: selected.has(mod.key + '|' + file.name), source: file.name });
      }
    }
    return all;
  }, [files, selected]);

  const processFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setError(''); setConfirmed(false); setPlanNote('');
    try {
      const parsedGroups = await Promise.all(Array.from(list).map(parseFile));
      const parsed = parsedGroups.flat();
      setFiles(prev => [...prev, ...parsed]);
    } catch { setError('No se pudieron analizar los archivos seleccionados.'); }
    finally { setBusy(false); }
  };
  const toggle = (id: string) => { setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); setConfirmed(false); };
  const selectedDetections = detections.filter(d => selected.has(d.key + '|' + d.source));
  const canPlan = selectedDetections.length > 0 && selectedDetections.every(d => d.status === 'complete' && !d.notes.some(n => n.includes('BLOQUEO:') || n.includes('no cuadran') || n.includes('no numéricos')));
  const finalizePlan = () => {
    if (!canPlan) { setConfirmed(false); setPlanNote('No se puede preparar el plan: hay módulos incompletos, posibles duplicados o errores de balance. Corrige los archivos o desmarca esos módulos.'); return; }
    setConfirmed(true);
    setPlanNote('Plan revisado localmente. No se han escrito datos ni modificado registros. La ejecución queda bloqueada hasta disponer de adaptadores transaccionales que validen referencias, duplicados y saldos por módulo.');
  };

  return <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
    <div className="flex gap-3 items-start">
      <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><ArrowRightLeft className="w-6 h-6" /></div>
      <div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-slate-900">Asistente Inteligente de Migración</h2><p className="text-sm text-slate-600 mt-1">Analiza varios archivos, detecta módulos compatibles y prepara un plan antes de importar.</p></div>
    </div>
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <Files className="w-8 h-8 mx-auto text-slate-500 mb-2" />
      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm cursor-pointer hover:bg-indigo-500">
        <FileUp className="w-4 h-4" /> {busy ? 'Analizando archivos…' : 'Seleccionar varios archivos'}
        <input type="file" multiple accept=".json,.csv,.tsv,.txt,.xlsx,.xlsm" className="hidden" disabled={busy} onChange={e => { void processFiles(e.target.files); e.currentTarget.value=''; }} />
      </label>
      <p className="text-xs text-slate-500 mt-2">JSON · CSV · TSV · TXT · Excel XLSX/XLSM. El análisis se realiza localmente.</p>
    </div>
    {error && <p className="text-sm text-rose-700">{error}</p>}
    {files.length > 0 && <div className="space-y-2"><h3 className="font-semibold text-slate-800">Archivos analizados ({files.length})</h3>{files.map((f,i) => <div key={f.name + i} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200"><div className="min-w-0"><p className="text-sm font-medium truncate">{f.name}</p><p className="text-xs text-slate-500">{f.error ? f.error : f.rows.length + ' filas interpretadas'}</p></div><button className="text-xs text-rose-700 font-semibold" onClick={() => {setFiles(prev=>prev.filter((_,j)=>j!==i));setConfirmed(false);}}>Quitar</button></div>)}</div>}
    {detections.length > 0 && <div className="space-y-3">
      <div className="flex items-center gap-2"><Search className="w-4 h-4 text-indigo-600"/><h3 className="font-semibold text-slate-800">Módulos detectados</h3></div>
      <p className="text-xs text-slate-500">Marca únicamente los módulos que deseas incluir. Los módulos repetidos por archivo se muestran por separado.</p>
      {detections.map((d,i) => { const id=d.key+'|'+d.source; const checked=selected.has(id); return <label key={id+i} className={'block p-4 rounded-xl border cursor-pointer '+(checked?'border-indigo-300 bg-indigo-50/40':'border-slate-200 hover:bg-slate-50')}>
        <div className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={checked} onChange={()=>toggle(id)}/><div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-sm text-slate-900">{d.name}</span><span className="text-xs text-slate-500">· {d.source}</span><span className={'text-[11px] px-2 py-0.5 rounded-full '+(d.status==='complete'?'bg-emerald-100 text-emerald-800':d.status==='blocked'?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-800')}>{d.status==='complete'?'Campos mínimos detectados':d.status==='blocked'?'Bloqueado por validación':'Parcial / requiere revisión'}</span></div>
          <p className="text-xs text-slate-600 mt-1">{d.rows.length} filas · {d.fields.length} columnas reconocidas</p>
          {d.missing.length>0 && <p className="text-xs text-amber-800 mt-2">Campos faltantes: {d.missing.join(', ')}</p>}
          {d.notes.map((n,j)=><p key={j} className="text-xs text-slate-600 mt-1 flex gap-1"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5"/>{n}</p>)}
        </div></div>
      </label>; })}
    </div>}
    {files.length>0 && <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">Revisión previa</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Filas analizadas</p><p className="text-xl font-bold">{files.reduce((n,f)=>n+f.rows.length,0)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Módulos seleccionados</p><p className="text-xl font-bold">{selectedDetections.length}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Archivos con error</p><p className="text-xl font-bold">{files.filter(f=>f.error).length}</p></div></div>
      {selectedDetections.map((d, index) => <div key={d.key + '|' + d.source + '|preview'} className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 text-sm font-semibold">{d.name} · {d.source} · vista previa de {Math.min(5, d.rows.length)} de {d.rows.length} filas</div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr>{Object.keys(d.rows[0] || {}).slice(0, 8).map(header => <th key={header} className="border-b p-2 whitespace-nowrap">{header}</th>)}</tr></thead><tbody>{d.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{Object.keys(d.rows[0] || {}).slice(0, 8).map(header => <td key={header} className="max-w-48 truncate border-b p-2" title={String(row[header] ?? '')}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div>
      </div>)}
      <div className="flex gap-2 items-start text-xs text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0"/><p>Protección activa: el análisis no modifica la base de datos. Los posibles duplicados y los descuadres contables bloquean el plan. Cada asiento debe cuadrar individualmente y las relaciones entre módulos deben validarse antes de cualquier escritura.</p></div>
      <button onClick={finalizePlan} disabled={!selectedDetections.length} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm disabled:opacity-40">Validar selección y preparar plan</button>
      {confirmed && <p className="text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5"/>{planNote}</p>}
      {!confirmed && planNote && <p className="text-sm text-amber-800">{planNote}</p>}
      <p className="text-xs text-slate-500">Esta fase prepara el plan, no ejecuta escrituras. La migración definitiva solo debe habilitarse cuando los adaptadores transaccionales puedan confirmar todos los módulos juntos o revertirlos íntegramente.</p>
    </div>}
  </section>;
};
