import React, { useMemo, useState } from 'react';
import { FileUp, X, CheckCircle2, AlertTriangle, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { isValidIsoDate, parseDelimitedRecords, parseMigrationNumber, validateUniqueMigrationHeaders } from '../../types/migrationParsing';
import { useAccounting } from '../../context/AccountingContext';

type Row = Record<string, unknown>;
type ModuleId = 'inventory' | 'customers' | 'receivables' | 'payables' | 'sales' | 'purchases' | 'accounts' | 'journal';
type ModuleInfo = { id: ModuleId; name: string; aliases: string[]; fields: string[]; transactional: boolean };
const POSVEN_COLLECTION_LABELS: Array<{label:string; match:RegExp}> = [
 {label:'Ventas y facturación',match:/sale|venta|invoice|factura/i},
 {label:'Compras y proveedores',match:/purchase|compra|supplier|proveedor/i},
 {label:'Inventario y productos',match:/product|inventory|inventario|stock|kardex/i},
 {label:'Clientes y cuentas por cobrar',match:/customer|client|receivable|cxc/i},
 {label:'Cuentas por pagar',match:/payable|cxp/i},
 {label:'Caja, movimientos de caja y cierres',match:/cash|caja|register|shift|corte|report.?z|movimiento.*caja|cash.*movement/i},
 {label:'Contabilidad y libro diario',match:/journal|ledger|account|asiento|diario|accounting/i},
 {label:'Impuestos y retenciones',match:/tax|vat|iva|retention|retencion|islr/i}
];
const MODULES: ModuleInfo[] = [
 { id:'inventory', name:'Inventario / productos', aliases:['code','codigo','sku','name','nombre','product','producto','currentstock','existencia'], fields:['code','name'], transactional:false },
 { id:'customers', name:'Clientes', aliases:['customername','clientename','customer','cliente','customerRif','rifcliente'], fields:['name','rif'], transactional:false },
 { id:'receivables', name:'Cuentas por cobrar (CxC)', aliases:['customername','invoiceNumber','factura','saldo','dueDate','vencimiento'], fields:['invoiceNumber','totalAmountBs'], transactional:true },
 { id:'payables', name:'Cuentas por pagar (CxP)', aliases:['supplierName','proveedor','supplierRif','invoiceNumber','saldo'], fields:['invoiceNumber','totalAmountBs'], transactional:true },
 { id:'sales', name:'Ventas / facturas', aliases:['invoiceDate','invoiceNumber','customerRif','customerName','vatAmountBs'], fields:['invoiceDate','invoiceNumber','totalAmountBs'], transactional:true },
 { id:'purchases', name:'Compras / facturas', aliases:['invoiceDate','invoiceNumber','supplierRif','supplierName','vatAmountBs'], fields:['invoiceDate','invoiceNumber','totalAmountBs'], transactional:true },
 { id:'accounts', name:'Plan de cuentas', aliases:['accountCode','accountName','accountType','codigo cuenta','nombre cuenta'], fields:['code','name','type'], transactional:false },
 { id:'journal', name:'Asientos contables', aliases:['entryNumber','accountCode','debitBs','creditBs','fecha','debe','haber'], fields:['date','items'], transactional:true }
];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const parseCsv = (text: string): Row[] => parseDelimitedRecords(text);
const scalar = (v: unknown): unknown => {
 if (v && typeof v === 'object' && 'text' in v) return (v as {text:unknown}).text;
 if (v && typeof v === 'object' && 'result' in v) return (v as {result:unknown}).result;
 if (v instanceof Date) return v.toISOString().slice(0,10);
 return v;
};
const toRows = (matrix: unknown[][]): Row[] => {
 if(matrix.length<2) return [];
 const headers=validateUniqueMigrationHeaders(matrix[0].map(v=>scalar(v)), 'hoja de Excel');
 return matrix.slice(1).filter(r=>r.some(v=>String(scalar(v)??'').trim())).map(r=>{
  const obj:Row={}; headers.forEach((h,i)=>{if(h)obj[h]=scalar(r[i]);}); return obj;
 });
};
const pick = (row:Row, ...keys:string[]) => {
 for(const key of keys){ const value=row[norm(key)]; if(value!==undefined&&value!==null&&String(value).trim()!=='') return value; }
 return undefined;
};

export const IntelligentMigrationWizard: React.FC<{onClose:()=>void}> = ({onClose}) => {
 const { products, importInventoryProducts, restoreBackupJson, accounts, addAccount, addJournalEntry, addSale, addPurchase, runAtomicInvoiceImport, sales, purchases, journalEntries, currentCompany } = useAccounting();
 const [files,setFiles]=useState<File[]>([]);
 const [rows,setRows]=useState<Row[]>([]);
 const [headers,setHeaders]=useState<string[]>([]);
 const [selected,setSelected]=useState<ModuleId[]>([]);
 const [moduleFilter,setModuleFilter]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [backupPayload,setBackupPayload]=useState<string|null>(null);
 const [backupCounts,setBackupCounts]=useState<Record<string,number>|null>(null);
 const [posvenBackup,setPosvenBackup]=useState(false);
 const [posvenQuality,setPosvenQuality]=useState({collections:0,objectRows:0,invalidRows:0,emptyCollections:0});
 const posvenPreview = useMemo(()=>{
  if(!posvenBackup||!backupPayload)return [] as Array<{name:string;count:number;objects:number;invalid:number;fields:string[];identityField:string;missingIdentity:number;duplicateIdentity:number;numericSummaries:Array<{field:string;count:number;sum:number}>;referenceFields:string[];relationshipHints:Array<{field:string;targetCollection:string}>;target:string;mode:string;reason:string}>;
  try{
   const root=JSON.parse(backupPayload) as {data?:Record<string,unknown>};
   return Object.entries(root.data??{}).filter(([,value])=>Array.isArray(value)).map(([name,value])=>{
    const list=value as unknown[];const objects=list.filter(row=>!!row&&typeof row==='object'&&!Array.isArray(row)) as Row[];
    const fields=Array.from(new Set(objects.slice(0,5).flatMap(row=>Object.keys(row)))).slice(0,12);
    // Diagnóstico preventivo: la clave candidata no se considera validada.
    const observedKeys=new Set(objects.flatMap(row=>Object.keys(row).map(norm)));
    const key=norm(name);
    const identityCandidates=/venta|sale|factura|invoice|compra|purchase|cxc|cxp|receivable|payable|diario|journal|asiento|reportez|zreport/i.test(key)
     ? ['id','uuid','invoicenumber','numerofactura','numero','documentnumber','referencia','codigo']
     : /producto|product|inventario|inventory|cliente|customer|proveedor|supplier|cuenta|account/i.test(key)
      ? ['id','uuid','sku','codigo','code','rif','taxid','accountcode','codigocuenta']
      : ['id','uuid','codigo','code','number','numero'];
    const identityKey=identityCandidates.find(candidate=>observedKeys.has(candidate))??'';
    const identityField=identityKey?(objects.flatMap(row=>Object.keys(row)).find(field=>norm(field)===identityKey)??identityKey):'';
    const identityValues=identityKey?objects.map(row=>String(row[Object.keys(row).find(field=>norm(field)===identityKey)??'']??'').trim()).filter(Boolean):[];
    const missingIdentity=identityKey?objects.length-identityValues.length:0;
    const identityCounts=new Map<string,number>();
    identityValues.forEach(value=>{const normalized=value.toLocaleLowerCase();identityCounts.set(normalized,(identityCounts.get(normalized)??0)+1);});
    const duplicateIdentity=identityKey?[...identityCounts.values()].reduce((sum,count)=>sum+(count>1?count-1:0),0):0;
    const allFieldNames=Array.from(new Set(objects.flatMap(row=>Object.keys(row))));
    const numericSummaries=allFieldNames.filter(field=>/(total|subtotal|amount|monto|importe|saldo|balance|debit|credit|debe|haber|iva|tax|cost|costo|price|precio|quantity|cantidad|stock|existencia)/i.test(norm(field))).map(field=>{
     const values=objects.map(row=>row[field]).filter(value=>value!==null&&value!==undefined&&String(value).trim()!=='');
     const numbers=values.map(value=>typeof value==='number'?value:typeof value==='string'?parseMigrationNumber(value):NaN);
     const valid=numbers.filter(Number.isFinite);
     return {field,count:valid.length,sum:valid.reduce((total,value)=>total+value,0)};
    }).filter(item=>item.count>0).slice(0,8);
    const referenceFields=allFieldNames.filter(field=>/(id|codigo|code|rif|referencia|documento|factura)/i.test(norm(field))&&/(cliente|customer|proveedor|supplier|producto|product|cuenta|account|venta|sale|compra|purchase|factura|invoice|asiento|journal)/i.test(norm(field))).slice(0,12);
    // Sugerencias nominales solamente: no se comparan valores ni se afirma integridad referencial.
    const relationshipHints=allFieldNames.flatMap(field=>{
     const fieldKey=norm(field);
     const targetPattern =
      /cliente|customer|clienterif|customerrif/.test(fieldKey)?/cliente|customer|clients?/i:
      /proveedor|supplier|vendor/.test(fieldKey)?/proveedor|supplier|vendors?/i:
      /producto|product|sku|itemcode/.test(fieldKey)?/producto|product|inventory|inventario/i:
      /cuenta|accountcode|codigocuenta/.test(fieldKey)?/cuenta|account|plan/i:
      /factura|invoice|ventaid|saleid|documento/.test(fieldKey)?/venta|sale|factura|invoice|compra|purchase/i:
      /asiento|journal|entrynumber/.test(fieldKey)?/diario|journal|asiento/i:null;
     if(!targetPattern)return [];
     const candidates=Object.keys(root.data??{}).filter(candidate=>candidate!==name&&targetPattern.test(candidate));
     return candidates.slice(0,2).map(targetCollection=>({field,targetCollection}));
    }).slice(0,10);
    let target='Sin destino identificado';let mode='No importar automáticamente';let reason='La colección requiere revisión de esquema y significado antes de asignar datos contables.';
    if(/^(productos|products|inventory|inventario)$/.test(key)){target='Inventario / productos';mode='Candidato a adaptación';reason='Validar SKU, unidad, existencia, costo, precio, moneda y fecha de corte.';}
    else if(/^(ventas|sales|facturas|invoices)$/.test(key)){target='Ventas / facturas';mode='Candidato a adaptación';reason='Validar encabezados y detalles, impuestos, pagos, cliente, anulaciones y evitar duplicar asientos/CxC.';}
    else if(/^(compras|purchases)$/.test(key)){target='Compras / facturas';mode='Candidato a adaptación';reason='Validar proveedor, detalles, impuestos, pagos, inventario y evitar duplicar asientos/CxP.';}
    else if(/^(clientes|customers|clients)$/.test(key)){target='Referencias de clientes';mode='Solo referencia';reason='Cruzar contra facturas; SICOVEN no ofrece importación independiente de este maestro en este flujo.';}
    else if(/^(proveedores|suppliers|vendors)$/.test(key)){target='Referencias de proveedores';mode='Solo referencia';reason='Cruzar contra compras; SICOVEN no ofrece importación independiente de este maestro en este flujo.';}
    else if(/^(cxc|receivables|cuentasporcobrar)$/.test(key)){target='Cuentas por cobrar';mode='Solo conciliación';reason='No contabilizar por separado sin conciliar facturas y pagos; SICOVEN deriva saldos desde ventas a crédito.';}
    else if(/^(cxp|payables|cuentasporpagar)$/.test(key)){target='Cuentas por pagar';mode='Solo conciliación';reason='No contabilizar por separado sin conciliar compras y pagos; SICOVEN deriva saldos desde compras a crédito.';}
    else if(/^(librodiario|journalentries|journal|asientos)$/.test(key)){target='Libro diario';mode='Solo conciliación';reason='Requiere validar cuentas, asiento completo, cuadre en Bs/USD, tasa BCV y duplicidad con operaciones importadas.';}
    else if(/^(movimientos|movements|stockmovements|inventorymovements)$/.test(key)){target='Movimientos (semántica por confirmar)';mode='Revisión manual';reason='Puede representar Kardex, caja u otros movimientos; no asignar hasta inspeccionar campos y referencias.';}
    else if(/^(devoluciones|returns|anulaciones|voids|cancelaciones)$/.test(key)){target='Devoluciones / anulaciones';mode='Solo conciliación';reason='Requiere enlazar la operación original y validar reversos de inventario, caja, impuestos y contabilidad.';}
    else if(/^(reportesz|zreports|cierresz|cierres)$/.test(key)){target='Reportes Z / cierres';mode='Evidencia de auditoría';reason='No son facturas importables; usar para conciliar totales de ventas, impuestos, medios de pago y caja.';}
    else if(/^(terminales|terminals|cajas|registers)$/.test(key)){target='Configuración operativa';mode='No importar';reason='Requiere una política explícita de equivalencia con las cajas/terminales de SICOVEN.';}
    return {name,count:list.length,objects:objects.length,invalid:list.length-objects.length,fields,identityField,missingIdentity,duplicateIdentity,numericSummaries,referenceFields,relationshipHints,target,mode,reason};
   });
  }catch{return [] as Array<{name:string;count:number;objects:number;invalid:number;fields:string[];identityField:string;missingIdentity:number;duplicateIdentity:number;numericSummaries:Array<{field:string;count:number;sum:number}>;referenceFields:string[];relationshipHints:Array<{field:string;targetCollection:string}>;target:string;mode:string;reason:string}>;}
 },[posvenBackup,backupPayload]);
 const analysis = useMemo(()=>{
  const sources = new Map<string, Row[]>();
  rows.forEach(row=>{
   const source=String(row.migrationsource??'archivo sin nombre');
   const group=sources.get(source)??[];
   group.push(row); sources.set(source,group);
  });
  const detected: Array<ModuleInfo & {source:string; matched:string[]; missing:string[]; detected:boolean; ready:boolean}> = [];
  for(const [source, sourceRows] of sources){
   const keys=new Set(sourceRows.flatMap(row=>Object.keys(row).filter(key=>key!=='migrationsource').map(norm)));
   for(const m of MODULES){
    const matched=m.aliases.filter(a=>keys.has(norm(a)));
    const groupsByModule:Partial<Record<ModuleId,string[][]>>={
     inventory:[['code','codigo','sku','productcode'],['name','nombre','productname','producto']],
     customers:[['customername','clientename','customer','cliente','customerrif','rifcliente'],['rif','taxid','identificacion']],
     receivables:[['customername','cliente','clienterif','rifcliente'],['invoicenumber','invoice','factura','documento'],['saldo','saldoactual','monto','importe','balance','amount']],
     payables:[['suppliername','proveedor','proveedorrif','rifproveedor'],['invoicenumber','invoice','factura','documento'],['saldo','saldoactual','monto','importe','balance','amount']],
     sales:[['invoiceDate','fecha','date'],['invoiceNumber','factura','documento'],['totalAmountBs','total','totalbs','monto']],
     purchases:[['invoiceDate','fecha','date'],['invoiceNumber','factura','documento'],['totalAmountBs','total','totalbs','monto']],
     accounts:[['accountCode','codigo','code','cuenta'],['accountName','nombre','descripcion','name']],
     journal:[['fecha','date'],['accountCode','cuenta','codigocuenta'],['debitBs','debito','debe','debit'],['creditBs','credito','haber','credit']]
    };
    const groups=groupsByModule[m.id]??[m.fields];
    const matchedGroups=groups.filter(group=>group.some(key=>keys.has(norm(key)))).length;
    const specificSignals:Partial<Record<ModuleId,string[]>>={
     inventory:['sku','productcode','itemcode','existencia','currentstock'],
     customers:['customerid','customerrif','rifcliente','taxid','identificacion'],
     receivables:['customername','clienterif','rifcliente'],
     payables:['suppliername','supplierid','supplierrif','rifproveedor'],
     sales:['invoicenumber','numerofactura','customerrif'],
     purchases:['invoicenumber','numerofactura','supplierrif'],
     accounts:['accountcode','accountname','clasificacion'],
     journal:['accountcode','codigocuenta','debitbs','creditbs','debe','haber']
    };
    const hasSpecific=(specificSignals[m.id]??[]).some(key=>keys.has(norm(key)));
    if(matchedGroups<2&&!hasSpecific) continue;
    const missing=m.fields.filter(field=>!keys.has(norm(field)));
    const ready=m.id==='inventory'&&groups[0].some(k=>keys.has(norm(k)))&&groups[1].some(k=>keys.has(norm(k)))&&
     ['currentstock','existencia','stock','quantity','cantidad'].some(k=>keys.has(norm(k)))&&
     ['avgcostbs','costopromediobs','costbs','costobs','costo','costounitario','unitcost'].some(k=>keys.has(norm(k)))&&
     ['salespricebs','precioventabs','pricebs','precioventa'].some(k=>keys.has(norm(k)));
    const accountReady=m.id==='accounts'&&['code','accountcode','codigo','codigocuenta'].some(k=>keys.has(norm(k)))&&['name','accountname','nombre','nombrecuenta'].some(k=>keys.has(norm(k)))&&['type','accounttype','tipo','tipocuenta','clasificacion'].some(k=>keys.has(norm(k)));
    const journalReady=m.id==='journal'&&['date','fecha'].some(k=>keys.has(norm(k)))&&['accountcode','codigocuenta','cuenta'].some(k=>keys.has(norm(k)))&&['debitbs','debe','debito'].some(k=>keys.has(norm(k)))&&['creditbs','haber','credito'].some(k=>keys.has(norm(k)));
    const salesReady=m.id==='sales'&&['invoicedate','fecha'].some(k=>keys.has(norm(k)))&&['invoicenumber','factura','documento'].some(k=>keys.has(norm(k)))&&['customerrif','rifcliente','rif'].some(k=>keys.has(norm(k)))&&['customername','cliente','nombrecliente'].some(k=>keys.has(norm(k)))&&['totalamountbs','totalbs','total'].some(k=>keys.has(norm(k)));
    const purchasesReady=m.id==='purchases'&&['invoicedate','fecha'].some(k=>keys.has(norm(k)))&&['invoicenumber','factura','documento'].some(k=>keys.has(norm(k)))&&['supplierrif','rifproveedor','rif'].some(k=>keys.has(norm(k)))&&['suppliername','proveedor','nombreproveedor'].some(k=>keys.has(norm(k)))&&['totalamountbs','totalbs','total'].some(k=>keys.has(norm(k)));
    const readyFinal=ready||accountReady||journalReady||salesReady||purchasesReady;
    detected.push({...m,source,matched,missing,detected:true,ready:readyFinal});
   }
  }
  return detected;
 },[rows]);
 const readFiles=async(list:File[])=>{
  setError('');setNotice('');setRows([]);setHeaders([]);setSelected([]);setConfirmed(false);setBackupPayload(null);setBackupCounts(null);setPosvenBackup(false);setPosvenQuality({collections:0,objectRows:0,invalidRows:0,emptyCollections:0});setFiles(list);
  if(!list.length)return;
  try{
   if(list.length===1 && list[0].name.toLowerCase().endsWith('.json')){
    const raw=await list[0].text();
    const data=JSON.parse(raw);
    // Detectar respaldos POSVEN versionados cuyo contenido vive dentro de data.
    // No se deben tratar como respaldo nativo de SICOVEN ni restaurar a ciegas.
    if(data && typeof data==='object' && !Array.isArray(data) && String((data as Record<string,unknown>).app??'').toLowerCase()==='posven-pro' && (data as Record<string,unknown>).data && typeof (data as Record<string,unknown>).data==='object' && !Array.isArray((data as Record<string,unknown>).data)){
     const payload=(data as {data:Record<string,unknown>}).data;
     const arrayCollections=Object.entries(payload).filter(([,value])=>Array.isArray(value));
     const counts=Object.fromEntries(arrayCollections.map(([key,value])=>[key,(value as unknown[]).length]));
     const allRows=arrayCollections.flatMap(([,value])=>value as unknown[]);
     const objectRows=allRows.filter(value=>!!value&&typeof value==='object'&&!Array.isArray(value)).length;
     setPosvenQuality({collections:arrayCollections.length,objectRows,invalidRows:allRows.length-objectRows,emptyCollections:arrayCollections.filter(([,value])=>(value as unknown[]).length===0).length});
     setBackupPayload(raw);setBackupCounts(counts);setPosvenBackup(true);
     return;
    }
    const collections=['companies','accounts','journalEntries','purchases','sales','products','movements','vatVouchers','islrVouchers','bankAccounts','bankStatementMovements'];
    if(data && typeof data==='object' && !Array.isArray(data) && collections.every(key=>Array.isArray((data as Record<string,unknown>)[key]))){
     if(!(data as Record<string,unknown>).companies || ((data as {companies:unknown[]}).companies.length===0)) throw new Error('El respaldo no contiene empresas. No se modificó la información actual.');
     setBackupPayload(raw);
     setBackupCounts(Object.fromEntries(collections.map(key=>[key,((data as Record<string,unknown>)[key] as unknown[]).length])));
     return;
    }
   }
   const combined:Row[]=[]; const allHeaders = new Set<string>();
   for(const file of list){
    const ext=file.name.toLowerCase().split('.').pop();
    let parsed:Row[]=[];
    if(ext==='json'){
     const data=JSON.parse(await file.text());
     const array=Array.isArray(data)?data:Array.isArray(data.records)?data.records:Array.isArray(data.data)?data.data:Array.isArray(data.items)?data.items:Array.isArray(data.products)?data.products:null;
     if(!array) throw new Error(file.name+': el JSON debe ser un arreglo de registros o contener records, data, items o products. Los respaldos contables completos se analizan por módulo y no se importan a ciegas.');
     const invalidRows=(array as unknown[]).filter((x: unknown)=>!x||typeof x!=='object'||Array.isArray(x)).length;
     if(invalidRows>0)throw new Error(file.name+': el JSON contiene '+invalidRows+' fila(s) que no son objetos de registro. Corrige el archivo; no se importó ningún registro.');
     parsed=array as Row[];
    }else if(ext==='csv'||ext==='tsv'||ext==='txt'){
     parsed=parseCsv(await file.text());
    }else if(ext==='xlsx'||ext==='xlsm'){
     const wb=new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
     if(!wb.worksheets.length)throw new Error(file.name+': no contiene hojas.');
     const sheetRows: Row[] = [];
     for(const sheet of wb.worksheets){
      const matrix:unknown[][]=[];
      sheet.eachRow({includeEmpty:false},row=>{const vals:unknown[]=[];for(let c=1;c<=row.cellCount;c++)vals.push(scalar(row.getCell(c).value));matrix.push(vals);});
      const parsedSheet=toRows(matrix).map(row => ({ ...row, _migrationSource: file.name + ' — hoja: ' + sheet.name }));
      if(parsedSheet.length) sheetRows.push(...parsedSheet);
     }
     parsed=sheetRows;
    }else throw new Error(file.name+': formato no admitido. Use JSON, CSV, TSV, TXT o Excel XLSX/XLSM.');
    parsed=parsed.map((row,rowIndex)=>{const normalized:Row={};const seenKeys=new Set<string>();for(const [key,value] of Object.entries(row)){const normalizedKey=norm(key);if(!normalizedKey)continue;if(seenKeys.has(normalizedKey))throw new Error(file.name+', registro '+(rowIndex+1)+': hay claves duplicadas tras normalizar acentos, mayúsculas o signos ('+key+').');seenKeys.add(normalizedKey);normalized[normalizedKey]=scalar(value);}return {...normalized,migrationsource:String(normalized.migrationsource??file.name)};});
    if(!parsed.length)throw new Error(file.name+': no se detectaron filas de datos.');
    for (const row of parsed) for (const key of Object.keys(row)) allHeaders.add(norm(key));
    combined.push(...parsed);
   }
   setRows(combined);setHeaders(Array.from(allHeaders));
   const keySet=new Set(Array.from(allHeaders));
   const detected=MODULES.filter(m=>m.aliases.filter(a=>keySet.has(norm(a))).length>=Math.min(2,m.aliases.length)).map(m=>m.id);
   const inventorySources = new Map<string, Row[]>();
   combined.forEach(row => { const source = String(row.migrationsource ?? 'archivo sin nombre'); const group = inventorySources.get(source) ?? []; group.push(row); inventorySources.set(source, group); });
   const inventoryReadyInOneSource = [...inventorySources.values()].some(sourceRows => {
    const sourceKeys = new Set(sourceRows.flatMap(row => Object.keys(row).filter(key => key !== 'migrationsource').map(norm)));
    return [['code','codigo','sku','productCode'],['name','nombre','productName','producto'],['currentStock','existencia','stock','quantity','cantidad'],['avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost'],['salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta']].every(group => group.some(key => sourceKeys.has(norm(key))));
   });
   setSelected(inventoryReadyInOneSource && detected.includes('inventory') ? ['inventory'] : []);
  }catch(e){setError(e instanceof Error?e.message:'No se pudieron leer los archivos.');}
 };
 const runBackupImport=async()=>{
  setError('');setNotice('');
  if(!backupPayload){setError('No hay un respaldo válido seleccionado.');return;}
  if(!confirmed){setError('Confirma que deseas reemplazar los datos actuales por el contenido del respaldo.');return;}
  setBusy(true);
  try{
   const imported=await restoreBackupJson(backupPayload);
   if(!imported) throw new Error('SICOVEN rechazó el respaldo por estructura inválida, referencias rotas o inconsistencias contables. Los datos actuales se conservan.');
   setNotice('Respaldo restaurado y confirmado en SQLite. Revisa empresa activa, saldos, inventario y asientos antes de continuar.');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo restaurar el respaldo.');}
  finally{setBusy(false);}
 };
 const runMigration=()=>{
  setError('');setNotice('');
  if(!confirmed){setError('Marca la confirmación final antes de ejecutar la migración.');return;}
  const available = new Set(headers.map(norm));
  const requiredInventoryFields = [['code','codigo','sku','productCode'],['name','nombre','productName','producto'],['currentStock','existencia','stock','quantity','cantidad'],['avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost'],['salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta']];
  if(selected.includes('inventory')){
   const missingInventoryFields = requiredInventoryFields.filter(group => !group.some(key => available.has(norm(key)))).map(group => group[0]);
   if (missingInventoryFields.length) { setError('No se puede migrar Inventario: faltan campos esenciales '+missingInventoryFields.join(', ')+'. No se supondrán existencias, costos ni precios en cero.'); return; }
  }
  if(selected.length<1 || !['inventory','accounts','journal','sales','purchases'].includes(selected[0])){setError('Selecciona al menos un módulo con importador disponible: Inventario, Plan de cuentas, Asientos, Ventas o Compras.');return;}
  setBusy(true);
  try{
   if(selected[0]==='sales'||selected[0]==='purchases'){
    const kind=selected[0];
    const rowsBySource=new Map<string,Row[]>();
    rows.forEach(row=>{const source=String(row.migrationsource??'archivo sin nombre');const group=rowsBySource.get(source)??[];group.push(row);rowsBySource.set(source,group);});
    const sourceGroups=[...rowsBySource.entries()].map(([source,group])=>{
     const sourceKeys=new Set(group.flatMap(row=>Object.keys(row).filter(key=>key!=='migrationsource').map(norm)));
     const hasPartySignal=kind==='sales'
      ? ['customername','cliente','nombrecliente','customerrif','rifcliente','clienterif'].some(key=>sourceKeys.has(norm(key)))
      : ['suppliername','proveedor','nombreproveedor','supplierrif','rifproveedor','proveedorrif'].some(key=>sourceKeys.has(norm(key)));
     const hasDocumentSignal=['invoicenumber','factura','documento','numerofactura'].some(key=>sourceKeys.has(norm(key)));
     const hasDateSignal=['invoicedate','fechafactura','fecha'].some(key=>sourceKeys.has(norm(key)));
     const hasAmountSignal=['totalamountbs','totalbs','total','vatamountbs','iva'].some(key=>sourceKeys.has(norm(key)));
     return {source,group,hasPartySignal,hasDocumentSignal,hasDateSignal,hasAmountSignal};
    });
    // No descartar silenciosamente un archivo que parece contener facturas pero carece de campos para identificarlo.
    const ambiguousSources=sourceGroups.filter(item=>item.hasDateSignal&&item.hasAmountSignal&&(!item.hasPartySignal||!item.hasDocumentSignal));
    if(ambiguousSources.length)throw new Error('Hay archivos que parecen contener '+(kind==='sales'?'ventas':'compras')+' pero no tienen encabezados suficientes de '+(kind==='sales'?'cliente':'proveedor')+' y número de factura: '+ambiguousSources.map(item=>item.source).join(', ')+'. No se importó nada. Separa los módulos o corrige los encabezados antes de continuar.');
    const sourceRows=sourceGroups.filter(item=>item.hasPartySignal&&item.hasDocumentSignal).flatMap(item=>item.group);
    if(sourceRows.length===0)throw new Error('No se identificaron archivos con encabezados de '+(kind==='sales'?'ventas y cliente':'compras y proveedor')+'. Verifica número de factura y datos de la contraparte.');
    const dateValue=(r:Row,i:number)=>{const value=String(pick(r,'invoiceDate','fechaFactura','fecha de factura','fecha')??'').slice(0,10);if(!isValidIsoDate(value))throw new Error('Fila '+(i+1)+': fecha de factura inválida; use AAAA-MM-DD.');return value;};
    const num=(r:Row,i:number,required:boolean,...keys:string[])=>{const raw=pick(r,...keys);if((raw===undefined||raw==='')&&required)throw new Error('Fila '+(i+1)+': falta el campo obligatorio '+keys[0]+'.');const value=raw===undefined||raw===''?0:parseMigrationNumber(raw);if(!Number.isFinite(value)||value<0)throw new Error('Fila '+(i+1)+': importe inválido en '+keys[0]+'.');return value;};
    const documentKey=(invoiceNumber:string,partyRif:string)=>norm(invoiceNumber)+'|'+norm(partyRif);
    const controlKey=(controlNumber:string,partyRif:string)=>norm(controlNumber)+'|'+norm(partyRif);
    const seen=new Set<string>();
    const seenControls=new Set<string>();
    const existingDocs=new Set((kind==='sales'?sales.map(d=>documentKey(d.invoiceNumber||'',d.customerRif||'')):purchases.map(d=>documentKey(d.invoiceNumber||'',d.supplierRif||''))));
    const existingControls=new Set((kind==='sales'?sales.map(d=>controlKey(d.controlNumber||'',d.customerRif||'')):purchases.map(d=>controlKey(d.controlNumber||'',d.supplierRif||''))).filter(key=>!key.startsWith('|')));
    const prepared=sourceRows.map((r,i)=>{
     const invoiceNumber=String(pick(r,'invoiceNumber','numeroFactura','numero de factura','factura','documento')??'').trim();
     const partyName=String(pick(r,kind==='sales'?'customerName':'supplierName',kind==='sales'?'cliente':'proveedor',kind==='sales'?'nombreCliente':'nombreProveedor')??'').trim();
     const partyRif=String(pick(r,kind==='sales'?'customerRif':'supplierRif',kind==='sales'?'rifCliente':'rifProveedor','rif','taxId')??'').trim();
     const incomingControl=String(pick(r,'controlNumber','numeroControl','numero de control')??'').trim();
     const key=documentKey(invoiceNumber,partyRif);
     if(!invoiceNumber||!partyName||!partyRif)throw new Error('Fila '+(i+1)+': número de factura, nombre y RIF de cliente/proveedor son obligatorios.');
     if(seen.has(key)||existingDocs.has(key))throw new Error('Factura duplicada para el mismo cliente/proveedor o ya existente: '+invoiceNumber+' ('+partyRif+'). No se sobrescribieron documentos.');seen.add(key);
     if(!incomingControl)throw new Error('Fila '+(i+1)+': número de control obligatorio.');
     const controlIdentity=controlKey(incomingControl,partyRif);
     if(seenControls.has(controlIdentity)||existingControls.has(controlIdentity))throw new Error('Número de control duplicado para el mismo cliente/proveedor o ya existente: '+incomingControl+' ('+partyRif+'). No se importó ningún documento.');
     seenControls.add(controlIdentity);
     const invoiceDate=dateValue(r,i);
     const totalAmountBs=num(r,i,true,'totalAmountBs','totalBs','total');
     const exemptAmountBs=num(r,i,true,'exemptAmountBs','montoExentoBs','exentoBs');
     const taxableBaseBs=num(r,i,true,'taxableBaseBs','baseImponibleBs','baseBs');
     const taxRate=num(r,i,true,'taxRate','alicuota','tasaIva');
     const vatAmountBs=num(r,i,true,'vatAmountBs','ivaBs','montoIvaBs');
     const vatWithheldBs=num(r,i,true,'vatWithheldBs','ivaRetenidoBs','retencionIvaBs');
     const bcvRate=num(r,i,false,'bcvRate','tasaBcv');
     const totalAmountUsd=num(r,i,true,'totalAmountUsd','totalUsd');
     const taxableBaseUsd=num(r,i,true,'taxableBaseUsd','baseImponibleUsd','baseUsd');
     const vatAmountUsd=num(r,i,true,'vatAmountUsd','ivaUsd');
     const vatWithheldUsd=num(r,i,true,'vatWithheldUsd','ivaRetenidoUsd');
     const paymentTermRaw=norm(String(pick(r,'paymentTerm','condicionPago','condicion')??''));
     if(!['contado','credito','cash','credit'].includes(paymentTermRaw))throw new Error('Fila '+(i+1)+': indique expresamente paymentTerm CONTADO o CREDITO; no se supondrá la condición de pago.');
     const paymentTerm=(paymentTermRaw==='contado'||paymentTermRaw==='cash'?'CONTADO':'CREDITO') as 'CONTADO'|'CREDITO';
     const creditDays=paymentTerm==='CREDITO'?num(r,i,true,'creditDays','diasCredito'):0;
     const dueDate=paymentTerm==='CREDITO'?String(pick(r,'dueDate','fechaVencimiento','vencimiento')??'').slice(0,10):undefined;
     if(paymentTerm==='CREDITO'&&(!Number.isInteger(creditDays)||creditDays<1||!isValidIsoDate(dueDate)))throw new Error('Fila '+(i+1)+': las facturas a crédito requieren días de crédito y vencimiento válidos.');
     const rate=bcvRate||currentCompany.bcvRate;
     if(rate<=0)throw new Error('Fila '+(i+1)+': la tasa BCV debe ser positiva.');
     const expectedBs=taxableBaseBs+exemptAmountBs+vatAmountBs;
     const expectedUsd=taxableBaseUsd+(rate>0?exemptAmountBs/rate:0)+vatAmountUsd;
     if(Math.abs(expectedBs-totalAmountBs)>0.02||Math.abs(expectedUsd-totalAmountUsd)>0.02)throw new Error('Fila '+(i+1)+': el total no cuadra con base imponible, exento e IVA en Bs/USD.');
     if(Math.abs(totalAmountBs/rate-totalAmountUsd)>0.02||Math.abs(taxableBaseBs/rate-taxableBaseUsd)>0.02||Math.abs(vatAmountBs/rate-vatAmountUsd)>0.02||Math.abs(vatWithheldBs/rate-vatWithheldUsd)>0.02)throw new Error('Fila '+(i+1)+': los importes en USD no corresponden a los importes en Bs divididos por la tasa BCV. El asiento nativo de SICOVEN usa esa conversión; corrija los datos antes de importar.');
     if(vatWithheldBs>totalAmountBs||vatWithheldUsd>totalAmountUsd)throw new Error('Fila '+(i+1)+': la retención supera el total de la factura.');
     const documentTypeRaw=String(pick(r,'documentType','tipoDocumento')??'01').trim();
     if(!['01','02','03'].includes(documentTypeRaw))throw new Error('Fila '+(i+1)+': tipo de documento inválido; use 01, 02 o 03.');
     const common={invoiceDate,invoiceNumber,controlNumber:String(pick(r,'controlNumber','numeroControl','numero de control')??'').trim(),documentType:documentTypeRaw as '01'|'02'|'03',totalAmountBs,exemptAmountBs,taxableBaseBs,taxRate,vatAmountBs,vatWithheldBs,bcvRate:rate,totalAmountUsd,taxableBaseUsd,vatAmountUsd,vatWithheldUsd,notes:String(pick(r,'notes','observaciones')??''),paymentTerm,creditDays,dueDate,currencyPricingMode:'REVISION_MANUAL' as const,fiscalAdjustmentMode:'REVISION_CONTADOR' as const};
     if(!common.controlNumber)throw new Error('Fila '+(i+1)+': número de control obligatorio.');
     if(kind==='sales')return {...common,customerRif:partyRif,customerName:partyName,customerAddress:String(pick(r,'customerAddress','direccionCliente')??''),retentionRate:num(r,i,false,'retentionRate','tasaRetencion'),retentionVoucherNumber:String(pick(r,'retentionVoucherNumber','comprobanteRetencion')??'')||undefined};
     const retentionRate=num(r,i,true,'retentionRate','tasaRetencion');
     const islrWithheldBs=num(r,i,true,'islrWithheldBs','islrRetenidoBs');
     const islrWithheldUsd=num(r,i,true,'islrWithheldUsd','islrRetenidoUsd');
     if(Math.abs(islrWithheldBs/rate-islrWithheldUsd)>0.02)throw new Error('Fila '+(i+1)+': la retención ISLR en USD no corresponde al importe en Bs dividido por la tasa BCV.');
     const netPayableBs=totalAmountBs-vatWithheldBs-islrWithheldBs;
     const netPayableUsd=totalAmountUsd-vatWithheldUsd-islrWithheldUsd;
     if(vatWithheldBs+islrWithheldBs>totalAmountBs+0.02||vatWithheldUsd+islrWithheldUsd>totalAmountUsd+0.02||netPayableBs < -0.02||netPayableUsd < -0.02)throw new Error('Fila '+(i+1)+': la suma de las retenciones IVA e ISLR supera el total de la factura.');
     return {...common,supplierRif:partyRif,supplierName:partyName,supplierAddress:String(pick(r,'supplierAddress','direccionProveedor')??''),islrWithheldBs,islrWithheldUsd,retentionRate,voucherNumber:String(pick(r,'voucherNumber','comprobanteRetencion')??'')||undefined,vatWithheldBs,vatWithheldUsd};
    });
    runAtomicInvoiceImport(()=>{
     if(kind==='sales')prepared.forEach(s=>addSale(s as Parameters<typeof addSale>[0]));
     else prepared.forEach(p=>addPurchase({...p,documentType:p.documentType,retentionRate:p.retentionRate,vatWithheldBs:p.vatWithheldBs,vatWithheldUsd:p.vatWithheldUsd} as Parameters<typeof addPurchase>[0]));
    });
    setNotice((kind==='sales'?'Ventas':'Compras')+' importadas: '+prepared.length+' facturas. SICOVEN generó los asientos y derivó CxC/CxP según la condición de pago. Revisa documentos, impuestos y saldos; confirma por separado el siguiente módulo.');
    setSelected(old=>old.filter(id=>id!==kind));setConfirmed(false);
     setBusy(false);return;
   }
   if(selected[0]==='accounts'){
    const sourceRows=rows.filter(r=>['code','accountcode','codigo','codigocuenta'].some(k=>pick(r,k)!==undefined)&&['name','accountname','nombre','nombrecuenta'].some(k=>pick(r,k)!==undefined));
    if(!sourceRows.length)throw new Error('No hay filas de plan de cuentas con código y nombre.');
    const typeMap:Record<string,string>={activo:'ACTIVO',pasivo:'PASIVO',patrimonio:'PATRIMONIO',ingresos:'INGRESOS',costos:'COSTOS',costo:'COSTOS',gastos:'GASTOS',asset:'ACTIVO',liability:'PASIVO',equity:'PATRIMONIO',income:'INGRESOS',cost:'COSTOS',expense:'GASTOS'};
    const seen=new Set<string>();const existing=new Set(accounts.map(a=>a.code.trim().toLowerCase()));
    const prepared=sourceRows.map((r,i)=>{
     const code=String(pick(r,'code','accountCode','codigo','codigoCuenta')??'').trim();
     const name=String(pick(r,'name','accountName','nombre','nombreCuenta','descripcion')??'').trim();
     const rawType=norm(String(pick(r,'type','accountType','tipo','tipoCuenta','clasificacion')??''));
     const type=typeMap[rawType];
     if(!code||!name)throw new Error('Fila '+(i+1)+': código y nombre son obligatorios.');
     if(!type)throw new Error('Fila '+(i+1)+': tipo de cuenta no reconocido. Use Activo, Pasivo, Patrimonio, Ingresos, Costos o Gastos.');
     const key=code.toLowerCase();if(seen.has(key)||existing.has(key))throw new Error('Código de cuenta duplicado o ya existente: '+code+'. No se sobrescribieron cuentas.');seen.add(key);
     const rawLevel=pick(r,'level','nivel');const level=rawLevel===undefined?code.split('.').length:parseMigrationNumber(rawLevel);
     if(!Number.isInteger(level)||level<1||level>5)throw new Error('Fila '+(i+1)+': nivel inválido para '+code+'.');
     const movementRaw=pick(r,'isMovement','cuentaMovimiento','movimiento','aceptaMovimientos');
     if(movementRaw===undefined)throw new Error('Fila '+(i+1)+': indique explícitamente si la cuenta admite movimientos (isMovement/aceptaMovimientos). No se inferirá por el nivel.');
     const movement=norm(String(movementRaw));
     if(!['true','false','si','no','yes','0','1','movimiento','detail','titulo','encabezado'].includes(movement))throw new Error('Fila '+(i+1)+': indicador de cuenta de movimiento inválido.');
     const isMovement=['true','si','yes','1','movimiento','detail'].includes(movement);
     const parentCode=String(pick(r,'parentCode','codigoPadre','cuentaPadre')??'').trim();
     return {code,name,type:type as 'ACTIVO'|'PASIVO'|'PATRIMONIO'|'INGRESOS'|'COSTOS'|'GASTOS',level,isMovement,parentCode:parentCode||undefined};
    });
    const allCodes=new Set([...existing,...seen]);
    for(const a of prepared){if(a.parentCode&&!allCodes.has(a.parentCode.toLowerCase()))throw new Error('La cuenta '+a.code+' referencia una cuenta padre inexistente: '+a.parentCode+'.');}
    prepared.forEach(a=>addAccount(a));
    setNotice('Plan de cuentas importado: '+prepared.length+' cuentas nuevas. Se validaron tipos, niveles, códigos duplicados y referencias de cuenta padre; confirma por separado el siguiente módulo.');
    setSelected(old=>old.filter(id=>id!=='accounts'));setConfirmed(false);
     setBusy(false);return;
   }
   if(selected[0]==='journal'){
    const sourceRows=rows.filter(r=>['accountCode','codigoCuenta','cuenta'].some(k=>pick(r,k)!==undefined));
    if(!sourceRows.length)throw new Error('No hay líneas de asientos con código de cuenta.');
    const accountMap=new Map(accounts.map(a=>[a.code.toLowerCase(),a]));
    const groups=new Map<string,Row[]>();
    sourceRows.forEach((r,i)=>{
     const date=String(pick(r,'date','fecha')??'').slice(0,10);
     if(!isValidIsoDate(date))throw new Error('Fila '+(i+1)+': fecha obligatoria en formato AAAA-MM-DD.');
     const ref=String(pick(r,'entryNumber','numeroAsiento','asiento','referenceDoc','referencia','documento')??'').trim();
     if(!ref)throw new Error('Fila '+(i+1)+': indique entryNumber/asiento/referencia para agrupar las líneas del mismo asiento.');
     const key=date+'|'+ref;const arr=groups.get(key)??[];arr.push(r);groups.set(key,arr);
    });
    const prepared=[...groups.entries()].map(([key,items])=>{
     const [date,ref]=key.split('|');
     const existingEntry=journalEntries.some(entry=>entry.date===date&&String(entry.referenceDoc??'').trim().toLowerCase()===ref.trim().toLowerCase());
     if(existingEntry)throw new Error('Ya existe un asiento con fecha '+date+' y referencia '+ref+'. No se importaron los asientos de este archivo para evitar duplicar contabilidad.');
     const lines=items.map(r=>{
      const code=String(pick(r,'accountCode','codigoCuenta','cuenta')??'').trim();
      const account=accountMap.get(code.toLowerCase());
      if(!account)throw new Error('Asiento '+ref+': cuenta inexistente '+code+'.');
      if(!account.isMovement)throw new Error('Asiento '+ref+': la cuenta '+code+' no admite movimientos.');
      const amount=(...keys:string[])=>{const raw=pick(r,...keys);const n=raw===undefined||raw===''?0:parseMigrationNumber(raw);if(!Number.isFinite(n)||n<0)throw new Error('Asiento '+ref+': importe inválido en '+keys[0]+'.');return n;};
      const debitBs=amount('debitBs','debe','debito');const creditBs=amount('creditBs','haber','credito');
      const debitUsd=amount('debitUsd','debeUsd','debitoUsd');const creditUsd=amount('creditUsd','haberUsd','creditoUsd');
      if((debitBs>0&&creditBs>0)||(debitUsd>0&&creditUsd>0)||(!debitBs&&!creditBs&&!debitUsd&&!creditUsd))throw new Error('Asiento '+ref+': cada línea debe registrar debe o haber, nunca ambos en la misma moneda.');
      return {accountCode:code,accountName:account.name,debitBs,creditBs,debitUsd,creditUsd,description:String(pick(r,'lineDescription','descripcionLinea','description','descripcion')??'')};
     });
     const sum=(field:'debitBs'|'creditBs'|'debitUsd'|'creditUsd')=>lines.reduce((s,l)=>s+l[field],0);
     if(lines.length<2||Math.abs(sum('debitBs')-sum('creditBs'))>=0.01||Math.abs(sum('debitUsd')-sum('creditUsd'))>=0.01||sum('debitBs')<=0||sum('debitUsd')<=0)throw new Error('Asiento '+ref+': debe tener al menos dos líneas y cuadrar con importes positivos en Bs y USD.');
     const rateRaw=pick(items[0],'bcvRate','tasaBcv');const bcvRate=rateRaw===undefined?0:parseMigrationNumber(rateRaw);
     if(!Number.isFinite(bcvRate)||bcvRate<=0)throw new Error('Asiento '+ref+': tasa BCV positiva obligatoria.');
     const parsedEntryNumber=/^\d+$/.test(ref)&&Number.isSafeInteger(Number(ref))&&Number(ref)>0?Number(ref):0;
     return {entryNumber:parsedEntryNumber,date,description:String(pick(items[0],'description','descripcion','concepto')??('Importación '+ref)),type:'MANUAL' as const,bcvRate,items:lines,referenceDoc:ref};
    });
    prepared.forEach(entry=>addJournalEntry(entry));
    setNotice('Asientos importados: '+prepared.length+'. Se validaron cuentas de movimiento, fechas, tasa BCV, líneas y cuadre en Bs y USD.');
    setSelected(old=>old.filter(id=>id!=='journal'));setConfirmed(false);
     setBusy(false);return;
   }
   const groupedBySource = new Map<string, Row[]>();
   rows.forEach(row => {
    const source = String(row.migrationsource ?? 'archivo sin nombre');
    const group = groupedBySource.get(source) ?? [];
    group.push(row);
    groupedBySource.set(source, group);
   });
   const inventoryRows = [...groupedBySource.entries()].filter(([, sourceRows]) => {
    const sourceKeys = new Set(sourceRows.flatMap(row => Object.keys(row).filter(key => key !== 'migrationsource')));
    return [
     ['code','codigo','sku','productcode'],
     ['name','nombre','productname','producto']
    ].every(group => group.some(key => sourceKeys.has(norm(key))));
   }).flatMap(([, sourceRows]) => sourceRows);
   if (!inventoryRows.length) throw new Error('No se identificaron archivos u hojas con encabezados de inventario (código y nombre). No se importó ningún registro.');
   const normalized=inventoryRows.map((r,i)=>({r,i}));
   const seen=new Set<string>();const existing=new Set(products.map(p=>p.code.trim().toLowerCase()));
   const prepared=normalized.map(({r,i})=>{
    const code=String(pick(r,'code','codigo','sku','productCode')??'').trim();
    const name=String(pick(r,'name','nombre','productName','producto')??'').trim();
    if(!code||!name)throw new Error('Registro '+(i+1)+': faltan código/SKU o nombre. No se importó ningún artículo.');
    const k=code.toLowerCase();
    if(seen.has(k))throw new Error('Código duplicado dentro de los archivos: '+code+'. No se importó ningún artículo.');
    if(existing.has(k))throw new Error('El código '+code+' ya existe en SICOVEN. No se sobrescriben registros automáticamente.');
    seen.add(k);
    const number=(...keys:string[])=>{const raw=pick(r,...keys); if(raw===undefined||raw===''){const essential=keys.some(key=>['currentStock','existencia','stock','quantity','cantidad','avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost','salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta'].includes(norm(key))); if(essential)throw new Error('Registro '+(i+1)+': falta el valor de '+keys[0]+'. No se asumirá cero ni se importará parcialmente.'); return 0;} const n=parseMigrationNumber(raw); if(!Number.isFinite(n)||n<0)throw new Error('Registro '+(i+1)+': valor numérico inválido en '+keys[0]+'.');return n;};
    const stock=number('currentStock','existencia','stock','quantity','cantidad');
    const cost=number('avgCostBs','costoPromedioBs','costBs','costoBs','costObs','costo','costoUnitario','unitCost');
    const priceBs=number('salesPriceBs','precioVentaBs','priceBs','salesPrice','precioVenta');
    const priceUsd=number('salesPriceUsd','precioVentaUsd','priceUsd');
    return {code,name,category:String(pick(r,'category','categoria')??'General'),unit:String(pick(r,'unit','unidad')??'Unidad'),minStock:number('minStock','stockMinimo'),currentStock:stock,avgCostBs:cost,avgCostUsd:number('avgCostUsd','costoPromedioUsd'),lastCostBs:number('lastCostBs')||cost,lastCostUsd:number('lastCostUsd'),salesPriceBs:priceBs,salesPriceUsd:priceUsd,costingMethod:'PROMEDIO_PONDERADO' as const,vatTreatment:'GENERAL_16' as const,itemType:'MERCANCIA' as const,openingDate:String(pick(r,'openingDate','fechaApertura')??new Date().toISOString().slice(0,10)),openingBcvRate:pick(r,'openingBcvRate','bcvRate')===undefined?undefined:number('openingBcvRate','bcvRate')};
   });
   const count=importInventoryProducts(prepared);
   setNotice('Migración completada: '+count+' artículos incorporados. SICOVEN no sobrescribió códigos existentes. Revisa el Kardex y la valoración inicial antes de continuar.');
   setSelected(old=>old.filter(id=>id!=='inventory'));setConfirmed(false);
    setBusy(false);
  }catch(e){setError(e instanceof Error?e.message:'La validación falló. No se completó la migración.');setBusy(false);}
 };
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="migration-title">
  <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
   <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white"><div><h2 id="migration-title" className="text-lg font-bold">Asistente Inteligente de Migración</h2><p className="mt-1 text-sm text-slate-300">Multiarchivo · detección de módulos · validación antes de escribir</p></div><button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-700"><X size={20}/></button></header>
   <div className="space-y-5 overflow-y-auto p-5">
    <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-emerald-500"><FileUp size={30} className="mb-2 text-emerald-700"/><strong>Selecciona uno o varios archivos</strong><span className="mt-1 text-sm text-slate-500">JSON, CSV, TSV, TXT, XLSX o XLSM · los archivos se analizan localmente</span><input className="mt-3 block max-w-full text-sm" type="file" multiple accept=".json,.csv,.tsv,.txt,.xlsx,.xlsm" onChange={e=>void readFiles(Array.from(e.target.files||[]))}/></label>
    {files.length>0&&<p className="text-sm text-slate-600">{files.length} archivo(s) · {posvenBackup?'respaldo POSVEN detectado':backupPayload?'respaldo completo SICOVEN detectado':rows.length+' registros detectados'}</p>}
    {backupPayload&&<section className={'rounded-xl border p-4 text-sm '+(posvenBackup?'border-sky-300 bg-sky-50 text-sky-950':'border-amber-300 bg-amber-50 text-amber-950')}><h3 className="font-bold">{posvenBackup?'Respaldo POSVEN detectado · versión '+String((()=>{try{return JSON.parse(backupPayload).version??'desconocida'}catch{return 'desconocida'}})()):'Respaldo completo de SICOVEN'}</h3><p className="mt-1">{posvenBackup?'Se reconoció la estructura versionada y se analizaron las colecciones dentro de data. Este archivo no es un respaldo nativo de SICOVEN: no se restaurará ni contabilizará directamente. El siguiente paso es mapear cada módulo al modelo contable de la empresa y validar saldos, relaciones y duplicados. No se ha escrito ningún dato.':'Se detectó un respaldo estructurado. Al confirmarlo, se reemplazarán los datos actuales por los del archivo, tras validar referencias y estructura.'}</p>{posvenBackup&&<div className="mt-3 rounded-lg border border-sky-200 bg-white/70 p-3"><strong>{Object.values(backupCounts??{}).reduce((sum,count)=>sum+count,0).toLocaleString('es-VE')} registros en arreglos detectados</strong><div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4"><div className="rounded-md bg-sky-50 p-2"><span className="block text-xs">Colecciones</span><strong>{posvenQuality.collections}</strong></div><div className="rounded-md bg-sky-50 p-2"><span className="block text-xs">Filas objeto</span><strong>{posvenQuality.objectRows.toLocaleString('es-VE')}</strong></div><div className="rounded-md bg-sky-50 p-2"><span className="block text-xs">Filas inválidas</span><strong>{posvenQuality.invalidRows.toLocaleString('es-VE')}</strong></div><div className="rounded-md bg-sky-50 p-2"><span className="block text-xs">Colecciones vacías</span><strong>{posvenQuality.emptyCollections}</strong></div></div><p className="mt-2 text-xs">Diagnóstico estructural solamente; estas cifras no implican que los registros estén validados contablemente ni que se hayan importado.</p></div>}<div className="mt-3 grid gap-3 md:grid-cols-2">{POSVEN_COLLECTION_LABELS.map(group=>{const entries=Object.entries(backupCounts??{}).filter(([name])=>group.match.test(name));if(!entries.length)return null;return <div key={group.label} className="rounded-lg border border-sky-200 bg-white/70 p-3"><h4 className="font-semibold">{group.label}</h4><ul className="mt-1 space-y-1">{entries.map(([name,count])=><li key={name} className="flex justify-between gap-3"><span className="break-all">{name}</span><strong className="shrink-0">{count.toLocaleString('es-VE')}</strong></li>)}</ul></div>})}</div><details className="mt-3"><summary className="cursor-pointer font-semibold">Ver todas las colecciones detectadas</summary><ul className="mt-2 grid grid-cols-2 gap-1 md:grid-cols-3">{Object.entries(backupCounts??{}).map(([name,count])=><li key={name}>{name}: <strong>{count.toLocaleString('es-VE')}</strong></li>)}</ul></details></section>}
    {posvenBackup&&posvenPreview.length>0&&<section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4"><h3 className="font-bold text-slate-900">Preclasificación de colecciones y esquema</h3><p className="mt-1 text-sm text-slate-600">Esta tabla es una propuesta de adaptación, no una autorización de importación. Las colecciones de conciliación no deben contabilizarse de nuevo si SICOVEN genera los mismos saldos desde facturas.</p><div className="mt-3 space-y-2">{posvenPreview.map(item=><details key={item.name} className="rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer"><span className="font-semibold">{item.name}</span><span className="ml-2 text-sm text-slate-500">{item.count.toLocaleString('es-VE')} filas</span><span className="mt-1 block text-sm">{item.target} · <strong>{item.mode}</strong></span></summary><div className="mt-3 grid gap-2 text-sm md:grid-cols-2"><p>Objetos válidos estructuralmente: <strong>{item.objects.toLocaleString('es-VE')}</strong></p><p>Filas inválidas (no objeto): <strong>{item.invalid.toLocaleString('es-VE')}</strong></p><p>Clave candidata: <strong>{item.identityField||'No detectada'}</strong></p><p>Clave candidata vacía: <strong>{item.identityField?item.missingIdentity.toLocaleString('es-VE'):'No evaluable'}</strong></p><p>Posibles duplicados de esa clave: <strong>{item.identityField?item.duplicateIdentity.toLocaleString('es-VE'):'No evaluable'}</strong></p><p className="md:col-span-2 text-xs text-amber-800">La clave se infiere por nombre de colección y campos; duplicados/vacíos son señales de revisión, no prueba definitiva de registros duplicados.</p>{item.referenceFields.length>0&&<div className="md:col-span-2"><span className="font-semibold">Campos que podrían contener referencias:</span><p className="break-words text-xs text-slate-600">{item.referenceFields.join(', ')}</p><p className="text-xs text-amber-800">Se identifican por nombre; aún no se afirma que las referencias existan en las otras colecciones.</p></div>}{item.relationshipHints.length>0&&<div className="md:col-span-2 rounded-md border border-indigo-100 bg-indigo-50/60 p-2"><span className="font-semibold">Posibles vínculos entre colecciones (heurística por nombre):</span><ul className="mt-1 space-y-1">{item.relationshipHints.map((hint,index)=><li key={hint.field+'-'+hint.targetCollection+'-'+index} className="break-words text-xs text-slate-700"><strong>{hint.field}</strong> → {hint.targetCollection}</li>)}</ul><p className="mt-1 text-xs text-amber-800">No se compararon identificadores ni se comprobó que los registros relacionados existan. Estos vínculos no autorizan importar ni contabilizar datos.</p></div>}{item.numericSummaries.length>0&&<div className="md:col-span-2"><span className="font-semibold">Sumas exploratorias de campos numéricos:</span><div className="mt-1 grid gap-1 sm:grid-cols-2">{item.numericSummaries.map(summary=><p key={summary.field} className="break-all text-xs text-slate-600">{summary.field}: {summary.count.toLocaleString('es-VE')} valores numéricos · suma {summary.sum.toLocaleString('es-VE',{maximumFractionDigits:4})}</p>)}</div><p className="text-xs text-amber-800">No se infiere moneda ni significado contable; los valores no numéricos se excluyen. Usar únicamente como pista de conciliación.</p></div>}<p className="md:col-span-2">{item.reason}</p><div className="md:col-span-2"><span className="font-semibold">Campos observados en las primeras 5 filas:</span><p className="mt-1 break-words text-xs text-slate-600">{item.fields.length?item.fields.join(', '):'No hay campos de objeto para inspeccionar.'}</p></div></div></details>)}</div></section>}
    {analysis.length>0&&<section><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-800">Módulos detectados automáticamente</h3><span className="text-xs text-slate-500">{analysis.filter(m=>m.ready).length} listos · {analysis.filter(m=>!m.ready).length} requieren revisión</span></div><label className="mb-3 block"><span className="mb-1 block text-xs font-semibold text-slate-600">Filtrar resultados por módulo o estado</span><input value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)} placeholder="Ej.: inventario, CxC, ventas, requiere revisión…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={()=>setModuleFilter('')} className="rounded-full border px-3 py-1 text-xs">Ver todos ({analysis.length})</button><button type="button" onClick={()=>setModuleFilter('listos')} className="rounded-full border px-3 py-1 text-xs">Solo listos</button><button type="button" onClick={()=>setModuleFilter('revisión')} className="rounded-full border px-3 py-1 text-xs">Requieren revisión</button><button type="button" onClick={()=>setSelected([])} className="rounded-full border px-3 py-1 text-xs">Limpiar selección</button></div><div className="grid gap-2 md:grid-cols-2">{analysis.filter(m=>{const q=norm(moduleFilter);if(!q)return true;if(q==='listos')return m.ready;if(q==='revision'||q==='revisión')return !m.ready;return norm(m.name+' '+m.id+' '+m.source+' '+m.missing.join(' ')).includes(q);}).map(m=><label key={m.id+'-'+m.source} className={'flex items-start gap-3 rounded-xl border p-3 '+(m.ready?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50')}><input type="checkbox" className="mt-1" checked={selected.includes(m.id)} disabled={!m.ready||!['inventory','accounts','journal','sales','purchases'].includes(m.id)} onChange={e=>setSelected(old=>e.target.checked?[...old.filter(id=>id!==m.id),m.id]:old.filter(id=>id!==m.id))}/><span className="min-w-0"><span className="block font-semibold text-slate-800">{m.name}</span><span className="block text-xs text-slate-500">Origen: {m.source}</span><span className="block text-xs text-slate-600">{m.ready?'Detectado · importador disponible':m.id==='customers'?'Los clientes se conservan en sus facturas; no existe maestro independiente.':m.id==='receivables'?'La CxC se calcula desde facturas de venta marcadas a crédito.':m.id==='payables'?'La CxP se calcula desde facturas de compra marcadas a crédito.':'Detectado parcialmente · faltan campos o validaciones'}</span>{m.missing.length>0&&<span className="block text-xs text-amber-800">Campos no detectados: {m.missing.join(', ')}</span>}</span></label>)}</div><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Puedes seleccionar varios módulos: se procesarán en cola, uno por ejecución, con confirmación independiente para cada uno. No es una transacción atómica conjunta; los módulos completados no se revierten si uno posterior falla. CxC se deriva de las ventas a crédito y CxP de las compras a crédito; no las selecciones como una carga independiente para evitar duplicar saldos.</p></section>}
    {rows.length>0&&<section className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center gap-2 font-semibold"><FileSpreadsheet size={17}/> Vista previa (primeros 5 registros)</div><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr>{headers.slice(0,8).map(h=><th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((r,i)=><tr key={i}>{headers.slice(0,8).map(h=><td key={h} className="max-w-40 truncate border-b p-2">{String(r[h]??'')}</td>)}</tr>)}</tbody></table></div></section>}
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><div className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck size={17}/> Controles de seguridad</div>Se rechazan códigos duplicados y campos numéricos inválidos; no se sobrescriben artículos existentes. Ventas, compras, plan de cuentas y asientos disponen de importadores con validaciones contables específicas. CxC y CxP se derivan de facturas de crédito; clientes y proveedores no se importan como maestros separados porque el modelo actual los conserva dentro de sus documentos. Revisa la vista previa y confirma antes de importar.</div>
    {error&&<div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
    {notice&&<div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline" size={17}/>{notice}</div>}
    {(rows.length>0||(backupPayload&&!posvenBackup))&&<label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/><span>{backupPayload?'Confirmo que revisé el respaldo y autorizo reemplazar los datos actuales por los contenidos en este archivo.':'Confirmo que revisé los archivos y la vista previa, y autorizo la importación del módulo seleccionado. Entiendo que los códigos existentes no serán sobrescritos.'}</span></label>}
   </div>
   <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cerrar</button><button disabled={busy||posvenBackup||(!backupPayload&&(!rows.length||!confirmed||selected.length<1||!['inventory','accounts','journal','sales','purchases'].includes(selected[0])))||(!!backupPayload&&!confirmed)} onClick={backupPayload?runBackupImport:runMigration} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy?'Validando e importando…':posvenBackup?'Adaptador contable pendiente':backupPayload?'Restaurar respaldo completo':'Importar siguiente módulo'}</button></footer>
  </div>
 </div>;
};
