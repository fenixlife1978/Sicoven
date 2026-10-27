import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { NewBankAccountModal } from '../Conciliacion/NewBankAccountModal';
import { Landmark, Plus, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Wallet, ReceiptText } from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';

type MovementKind = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export const TesoreriaView: React.FC = () => {
  const { currentCompany, accounts, bankAccounts, journalEntries, registerTreasuryMovement } = useAccounting();
  const [showNewBank, setShowNewBank] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [kind, setKind] = useState<MovementKind>('INCOME');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [counterpartCode, setCounterpartCode] = useState('');
  const [destinationBankId, setDestinationBankId] = useState('');
  const [message, setMessage] = useState('');

  const activeBank = bankAccounts.find(b => b.id === selectedBankId) || bankAccounts[0];
  const accountCodes = useMemo(() => new Set(bankAccounts.map(b => b.accountCode)), [bankAccounts]);
  const counterpartAccounts = accounts.filter(a => a.isMovement && !accountCodes.has(a.code));
  const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
  const balanceFor = (bankId: string) => {
    const bank = bankAccounts.find(b => b.id === bankId);
    if (!bank) return { bs: 0, usd: 0 };
    return companyEntries.reduce((total, entry) => {
      for (const item of entry.items) {
        if (item.accountCode !== bank.accountCode) continue;
        total.bs += (item.debitBs || 0) - (item.creditBs || 0);
        total.usd += (item.debitUsd || 0) - (item.creditUsd || 0);
      }
      return total;
    }, { bs: bank.initialBalanceBs, usd: bank.initialBalanceUsd });
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const entry = registerTreasuryMovement({
        bankAccountId: activeBank?.id || selectedBankId,
        date, reference, description, type: kind, amount: Number(amount),
        counterpartAccountCode: kind === 'TRANSFER' ? undefined : counterpartCode,
        destinationBankAccountId: kind === 'TRANSFER' ? destinationBankId : undefined
      });
      setMessage('Movimiento contabilizado automáticamente en el asiento #' + entry.entryNumber + '.');
      setReference(''); setDescription(''); setAmount('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el movimiento.');
    }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800"><Landmark className="h-3.5 w-3.5"/> Tesorería</div>
          <h1 className="text-xl font-bold text-slate-900">Cuentas bancarias y movimientos</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">Registre bancos una sola vez. SICOVEN crea su auxiliar contable y genera automáticamente los asientos de apertura, ingresos, egresos y transferencias.</p>
        </div>
        <button onClick={() => setShowNewBank(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500"><Plus className="h-4 w-4"/> Registrar cuenta bancaria</button>
      </div>
    </section>

    {bankAccounts.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Landmark className="mx-auto mb-3 h-10 w-10 text-slate-300"/>
      <h2 className="font-semibold text-slate-800">Aún no hay cuentas de tesorería</h2>
      <p className="mt-1 text-xs text-slate-500">Registre un banco para crear automáticamente el auxiliar contable dentro del Plan de Cuentas.</p>
      <button onClick={() => setShowNewBank(true)} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Registrar primer banco</button>
    </section> : <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bankAccounts.map(bank => {
          const balance = balanceFor(bank.id);
          return <button key={bank.id} onClick={() => setSelectedBankId(bank.id)} className={'rounded-xl border p-4 text-left transition ' + ((activeBank?.id === bank.id) ? 'border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300')}>
            <div className="flex items-start justify-between gap-2"><span className="text-sm font-bold text-slate-900">{bank.bankName}</span><Landmark className="h-4 w-4 text-emerald-600"/></div>
            <p className="mt-1 font-mono text-[11px] text-slate-500">•••• {bank.accountNumber.slice(-4)} · {bank.accountType || 'CORRIENTE'} · {bank.currency}</p>
            <p className="mt-3 text-[11px] text-slate-500">Auxiliar contable</p><p className="font-mono text-xs font-semibold text-slate-800">{bank.accountCode}</p>
            <div className="mt-3 border-t border-slate-200 pt-3"><p className="text-[11px] text-slate-500">Saldo en libros</p><p className="text-base font-bold text-slate-900">{formatBs(balance.bs)}</p><p className="text-xs text-slate-600">{formatUsd(balance.usd)}</p></div>
          </button>;
        })}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-600"/><h2 className="font-bold text-slate-900">Registrar movimiento</h2></div>
          <p className="text-xs text-slate-500">La operación genera el asiento en el Libro Diario; no se registra como si fuera una línea del extracto bancario.</p>
          <label className="block text-xs font-semibold text-slate-700">Cuenta bancaria</label>
          <select required value={activeBank?.id || ''} onChange={e=>setSelectedBankId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs">
            {bankAccounts.map(b=><option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber.slice(-4)} ({b.currency})</option>)}
          </select>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">Tipo de operación</label><select value={kind} onChange={e=>setKind(e.target.value as MovementKind)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"><option value="INCOME">Ingreso / depósito</option><option value="EXPENSE">Egreso / pago / comisión</option><option value="TRANSFER">Transferencia entre cuentas propias</option></select></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">Fecha</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"/></div>
          </div>
          {kind === 'TRANSFER' ? <div><label className="mb-1 block text-xs font-semibold text-slate-700">Cuenta destino</label><select required value={destinationBankId} onChange={e=>setDestinationBankId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"><option value="">Seleccione otra cuenta propia</option>{bankAccounts.filter(b=>b.id!==activeBank?.id).map(b=><option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber.slice(-4)} ({b.currency})</option>)}</select></div> : <div><label className="mb-1 block text-xs font-semibold text-slate-700">Contrapartida contable</label><select required value={counterpartCode} onChange={e=>setCounterpartCode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"><option value="">Seleccione una cuenta de movimiento</option>{counterpartAccounts.map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></div>}
          <div><label className="mb-1 block text-xs font-semibold text-slate-700">Referencia / cheque / transferencia</label><input required value={reference} onChange={e=>setReference(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" placeholder="N.º de operación"/></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-700">Concepto</label><input required value={description} onChange={e=>setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" placeholder="Descripción de la operación"/></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-700">Importe ({activeBank?.currency === 'USD' ? '$ USD' : 'Bs.'})</label><input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" placeholder="0.00"/></div>
          <button type="submit" className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500">Contabilizar movimiento</button>
          {message && <p role="status" className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{message}</p>}
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5"><h2 className="font-bold text-slate-900">Movimientos en libros</h2><p className="mt-1 text-xs text-slate-500">Asientos contabilizados para {activeBank?.bankName || 'la cuenta seleccionada'}.</p></div>
          <div className="max-h-[620px] overflow-auto">
            {companyEntries.filter(e=>e.items.some(i=>i.accountCode===activeBank?.accountCode)).sort((a,b)=>b.date.localeCompare(a.date)||b.entryNumber-a.entryNumber).map(entry=><div key={entry.id} className="border-b border-slate-100 p-4 last:border-0">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-800">#{entry.entryNumber} · {entry.description}</p><p className="mt-1 text-[11px] text-slate-500">{formatDate(entry.date)} · Ref. {entry.referenceDoc || '—'}</p></div><span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{entry.type}</span></div>
              {entry.items.filter(i=>i.accountCode===activeBank?.accountCode).map((item,index)=><p key={index} className="mt-2 text-xs text-slate-700">{item.debitBs>0?'Entrada':'Salida'}: {formatBs(item.debitBs || item.creditBs)} <span className="text-slate-500">({formatUsd(item.debitUsd || item.creditUsd)})</span></p>)}
            </div>)}
            {!companyEntries.some(e=>e.items.some(i=>i.accountCode===activeBank?.accountCode)) && <p className="p-8 text-center text-xs text-slate-400">Sin movimientos contables para esta cuenta.</p>}
          </div>
        </section>
      </section>
    </>}
    <NewBankAccountModal isOpen={showNewBank} onClose={()=>setShowNewBank(false)}/>
  </div>;
};
