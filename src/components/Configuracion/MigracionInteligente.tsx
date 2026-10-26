import React, { useMemo, useState } from 'react';
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

const normalize = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
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
const csvRows = (text: string): Row[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const delimiter = [',',';','\t','|'].sort((a,b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const split = (line: string) => {
    const cells: string[] = []; let cell = ''; let quoted = false;
    for (let i=0;i<line.length;i++) { const c=line[i]; if (c === '"') { if (quoted && line[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (c === delimiter && !quoted) { cells.push(cell.trim()); cell=''; } else cell += c; }
    cells.push(cell.trim()); return cells;
  };
  const headers = split(lines[0]).map((h,i) => h || 'columna_' + (i+1));
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((v,i) => [headers[i] || 'columna_' + (i+1), v])));
};
async function parseFile(file: File): Promise<ParsedFile> {
  try {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'json') return { name: file.name, rows: asRows(JSON.parse(await file.text())) };
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return { name: file.name, rows: csvRows(await file.text()) };
    if (ext === 'xlsx' || ext === 'xlsm') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) return { name: file.name, rows: [], error: 'El libro no contiene hojas.' };
      const headers: string[] = [];
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col-1] = String(cell.value ?? 'columna_' + col); });
      const rows: Row[] = [];
      sheet.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const item: Row = {};
        headers.forEach((h,i) => { const v = row.getCell(i+1).value; item[h || 'columna_' + (i+1)] = v && typeof v === 'object' && 'text' in v ? (v as {text:string}).text : v; });
        if (Object.values(item).some(v => String(v ?? '').trim())) rows.push(item);
      });
      return { name: file.name, rows };
    }
    return { name: file.name, rows: [], error: 'Formato no admitido. Use JSON, CSV, TSV, TXT o Excel XLSX/XLSM.' };
  } catch (e) { return { name: file.name, rows: [], error: e instanceof Error ? e.message : 'No se pudo interpretar el archivo.' }; }
}

export const MigracionInteligente: React.FC = () => {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(['inventory']));
  const [error, setError] = useState('');
  const [planNote, setPlanNote] = useState('');

  const detections = useMemo<Detection[]>(() => {
    const all: Detection[] = [];
    for (const file of files) {
      if (file.error || !file.rows.length) continue;
      const fields = [...new Set(file.rows.flatMap(row => Object.keys(row).map(normalize)))];
      for (const mod of MODULES) {
        const matches = mod.required.map(group => group.some(alias => fields.includes(normalize(alias))));
        if (!matches.some(Boolean)) continue;
        const missing = mod.required.filter((group,i) => !matches[i]).map(group => group[0]);
        const rows = file.rows;
        const notes: string[] = [];
        if (mod.key === 'journal') {
          const sums = rows.reduce((acc,row) => {
            const find = (aliases: string[]) => { const key = Object.keys(row).find(k => aliases.includes(normalize(k))); const raw = key ? row[key] : 0; const n = Number(String(raw ?? '0').replace(',','.')); return Number.isFinite(n) ? n : NaN; };
            const d=find(mod.aliases.debit); const c=find(mod.aliases.credit);
            return { debit: acc.debit + (Number.isFinite(d)?d:0), credit: acc.credit + (Number.isFinite(c)?c:0), invalid: acc.invalid || !Number.isFinite(d) || !Number.isFinite(c) };
          }, { debit:0, credit:0, invalid:false });
          if (sums.invalid) notes.push('Hay importes contables no numéricos; requiere corrección.');
          else if (Math.abs(sums.debit-sums.credit)>0.01) notes.push('Débitos y créditos no cuadran (diferencia ' + (sums.debit-sums.credit).toFixed(2) + ').');
          else notes.push('Débitos y créditos globales cuadran; falta validar cada asiento y sus cuentas.');
        }
        const rowKeys = rows.map(row => {
          const key = Object.keys(row).find(k => ['invoice','invoicenumber','factura','documento','code','codigo','sku','rif','taxid','reference','referencia'].includes(normalize(k)));
          return key ? normalize(row[key]) : '';
        }).filter(Boolean);
        const duplicateCount = rowKeys.length - new Set(rowKeys).size;
        if (duplicateCount) notes.push('Posibles duplicados por identificador detectado: ' + duplicateCount + '.');
        if (missing.length) notes.push('Detección parcial: faltan campos obligatorios para este módulo.');
        if (mod.key !== 'journal') notes.push('La detección de columnas no sustituye la validación de relaciones y saldos antes de escribir.');
        all.push({ key: mod.key, name: mod.name, fields, rows, status: missing.length ? 'partial' : 'complete', missing, notes, selected: selected.has(mod.key + '|' + file.name), source: file.name });
      }
    }
    return all;
  }, [files, selected]);

  const processFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setError(''); setConfirmed(false); setPlanNote('');
    try {
      const parsed = await Promise.all(Array.from(list).map(parseFile));
      setFiles(prev => [...prev, ...parsed]);
    } catch { setError('No se pudieron analizar los archivos seleccionados.'); }
    finally { setBusy(false); }
  };
  const toggle = (id: string) => { setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); setConfirmed(false); };
  const selectedDetections = detections.filter(d => selected.has(d.key + '|' + d.source));
  const canPlan = selectedDetections.length > 0 && selectedDetections.every(d => d.status === 'complete' && !d.notes.some(n => n.includes('no cuadran') || n.includes('no numéricos')));
  const finalizePlan = () => {
    if (!canPlan) { setPlanNote('No se puede preparar el plan: hay módulos incompletos o errores de balance. Corrige los archivos o desmarca esos módulos.'); return; }
    setConfirmed(true);
    setPlanNote('Plan revisado localmente. No se han escrito datos ni se han modificado registros existentes; la ejecución requiere los adaptadores transaccionales de cada módulo.');
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
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-sm text-slate-900">{d.name}</span><span className="text-xs text-slate-500">· {d.source}</span><span className={'text-[11px] px-2 py-0.5 rounded-full '+(d.status==='complete'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800')}>{d.status==='complete'?'Campos mínimos detectados':'Parcial / requiere revisión'}</span></div>
          <p className="text-xs text-slate-600 mt-1">{d.rows.length} filas · {d.fields.length} columnas reconocidas</p>
          {d.missing.length>0 && <p className="text-xs text-amber-800 mt-2">Campos faltantes: {d.missing.join(', ')}</p>}
          {d.notes.map((n,j)=><p key={j} className="text-xs text-slate-600 mt-1 flex gap-1"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5"/>{n}</p>)}
        </div></div>
      </label>; })}
    </div>}
    {files.length>0 && <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">Revisión previa</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Filas analizadas</p><p className="text-xl font-bold">{files.reduce((n,f)=>n+f.rows.length,0)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Módulos seleccionados</p><p className="text-xl font-bold">{selectedDetections.length}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Archivos con error</p><p className="text-xl font-bold">{files.filter(f=>f.error).length}</p></div></div>
      <div className="flex gap-2 items-start text-xs text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0"/><p>Protección activa: el análisis no modifica la base de datos. Antes de ejecutar una migración real deben validarse duplicados, relaciones, integridad contable y persistencia transaccional.</p></div>
      <button onClick={finalizePlan} disabled={!selectedDetections.length} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm disabled:opacity-40">Validar selección y preparar plan</button>
      {confirmed && <p className="text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5"/>{planNote}</p>}
      {!confirmed && planNote && <p className="text-sm text-amber-800">{planNote}</p>}
      <p className="text-xs text-slate-500">No se permite confirmar la escritura desde esta fase de análisis; así se evita una importación parcial o descoordinada.</p>
    </div>}
  </section>;
};
