import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account, JournalEntry } from './accounting';
import { buildReversalItems } from './journalReversal';

const accounts: Account[] = [
  { code:'1.1', name:'Banco', type:'ACTIVO', level:2, isMovement:true },
  { code:'2.1', name:'Proveedores', type:'PASIVO', level:2, isMovement:true },
  { code:'3.1', name:'Resultados acumulados', type:'PATRIMONIO', level:2, isMovement:true },
  { code:'4.1', name:'Ingresos', type:'INGRESOS', level:2, isMovement:true },
  { code:'5.1', name:'Costo de ventas', type:'COSTOS', level:2, isMovement:true }
];
const source: JournalEntry = {
  id:'j-1', companyId:'c-1', entryNumber:1, date:'2026-08-15', description:'Venta',
  type:'VENTA', bcvRate:100, createdAt:'2026-08-15T12:00:00.000Z',
  items:[
    {accountCode:'1.1',accountName:'Banco',debitBs:10000,creditBs:0,debitUsd:100,creditUsd:0},
    {accountCode:'4.1',accountName:'Ingresos',debitBs:0,creditBs:8000,debitUsd:0,creditUsd:80},
    {accountCode:'5.1',accountName:'Costo de ventas',debitBs:2000,creditBs:0,debitUsd:20,creditUsd:0},
    {accountCode:'2.1',accountName:'Proveedores',debitBs:0,creditBs:4000,debitUsd:0,creditUsd:40}
  ]
};

test('contra-asiento invierte Debe/Haber en Bs y USD sin alterar las cuentas',()=>{
 const lines=buildReversalItems(source,accounts);
 assert.deepEqual(lines.map(x=>x.accountCode),['1.1','4.1','5.1','2.1']);
 assert.equal(lines.reduce((s,x)=>s+x.debitBs,0),12000);
 assert.equal(lines.reduce((s,x)=>s+x.creditBs,0),12000);
 assert.equal(lines[0].creditBs,10000);
 assert.equal(lines[1].debitBs,8000);
 assert.equal(lines[0].creditUsd,100);
});

test('AIA conserva cuentas de balance y reclasifica ingresos/costos a resultados acumulados',()=>{
 const lines=buildReversalItems(source,accounts,true,'3.1');
 assert.equal(lines[0].accountCode,'1.1');
 assert.equal(lines[1].accountCode,'3.1');
 assert.equal(lines[2].accountCode,'3.1');
 assert.equal(lines[3].accountCode,'2.1');
 assert.equal(lines.reduce((s,x)=>s+x.debitBs,0),lines.reduce((s,x)=>s+x.creditBs,0));
 assert.equal(lines.reduce((s,x)=>s+x.debitUsd,0),lines.reduce((s,x)=>s+x.creditUsd,0));
});

test('AIA exige una cuenta de patrimonio de movimiento',()=>{
 assert.throws(()=>buildReversalItems(source,accounts,true,'1.1'),/cuenta de patrimonio/);
});

test('rechaza una reversión si el plan ya no contiene la cuenta original',()=>{
 assert.throws(()=>buildReversalItems(source,accounts.filter(a=>a.code!=='4.1')),/No se encuentra la cuenta contable 4.1/);
});
