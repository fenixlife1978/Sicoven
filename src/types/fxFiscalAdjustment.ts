export type FxFiscalAdjustmentMode = 'IVA_ORIGINAL_DIF_CAMBIARIA' | 'AJUSTE_BASE_IVA' | 'REVISION_CONTADOR';
export type FxFiscalAdjustmentDirection = 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'NONE' | 'REVIEW_REQUIRED';
export interface FxFiscalAdjustmentInput { totalAmountUsd:number; taxableBaseUsd:number; vatAmountUsd:number; exemptAmountUsd:number; invoiceRate:number; settlementRate:number; settledAmountUsd:number; mode:FxFiscalAdjustmentMode; }
export interface FxFiscalAdjustment { settledSharePercent:number; deltaBaseBs:number; deltaVatBs:number; deltaExemptBs:number; deltaTotalBs:number; direction:FxFiscalAdjustmentDirection; requiresFiscalDocument:boolean; explanation:string; }
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
/** Calculates a documented adjustment proposal only; it never issues a fiscal document or silently changes the source invoice. */
export function calculateFxFiscalAdjustment(i:FxFiscalAdjustmentInput):FxFiscalAdjustment {
 const values=[i.totalAmountUsd,i.taxableBaseUsd,i.vatAmountUsd,i.exemptAmountUsd,i.invoiceRate,i.settlementRate,i.settledAmountUsd];
 if(!values.every(Number.isFinite)||i.totalAmountUsd<=0||i.invoiceRate<=0||i.settlementRate<=0||i.settledAmountUsd<0||i.settledAmountUsd>i.totalAmountUsd+0.005||i.taxableBaseUsd<0||i.vatAmountUsd<0||i.exemptAmountUsd<0||i.taxableBaseUsd+i.vatAmountUsd+i.exemptAmountUsd>i.totalAmountUsd+0.01) throw new Error('Datos inválidos para calcular el ajuste cambiario fiscal.');
 const share=Math.min(1,i.settledAmountUsd/i.totalAmountUsd), delta=i.settlementRate-i.invoiceRate;
 const deltaBaseBs=money(i.taxableBaseUsd*share*delta),deltaVatBs=money(i.vatAmountUsd*share*delta),deltaExemptBs=money(i.exemptAmountUsd*share*delta),deltaTotalBs=money(deltaBaseBs+deltaVatBs+deltaExemptBs);
 const direction:FxFiscalAdjustmentDirection=i.mode==='REVISION_CONTADOR'?'REVIEW_REQUIRED':deltaTotalBs>0.009?'DEBIT_NOTE':deltaTotalBs< -0.009?'CREDIT_NOTE':'NONE';
 const explanation=i.mode==='REVISION_CONTADOR'?'Requiere revisión del contador antes de definir el tratamiento fiscal.':i.mode==='IVA_ORIGINAL_DIF_CAMBIARIA'?'Se conserva el IVA original; documentar y validar el diferencial cambiario según contrato y normativa aplicable.':'Propuesta de ajuste proporcional de base imponible, IVA y exentos; requiere validar contrato y emitir/vincular el documento fiscal procedente.';
 return {settledSharePercent:money(share*100),deltaBaseBs,deltaVatBs,deltaExemptBs,deltaTotalBs,direction,requiresFiscalDocument:direction==='DEBIT_NOTE'||direction==='CREDIT_NOTE',explanation};
}
