import React from 'react';
import { Company } from '../types/accounting';
import { DEFAULT_LOGO_LOS_ANDES } from '../data/defaultLogos';

interface CompanyLogoHeaderProps {
  company: Company;
  reportTitle: string;
  subtitle?: string;
  periodText?: string;
}

export const CompanyLogoHeader: React.FC<CompanyLogoHeaderProps> = ({
  company,
  reportTitle,
  subtitle,
  periodText
}) => {
  const logo = company.logoUrl || DEFAULT_LOGO_LOS_ANDES;

  return (
    <div className="w-full pb-4 border-b-2 border-slate-900 mb-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Company Logo */}
        <div className="flex-shrink-0">
          {logo && (
            <img
              src={logo}
              alt={company.name}
              className="h-14 sm:h-16 w-auto object-contain max-w-[220px]"
            />
          )}
        </div>

        {/* Center / Right: Company Info and Official Title */}
        <div className="flex-1 text-right">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            {company.taxpayerType === 'ESPECIAL' ? 'Contribuyente Especial SENIAT' : 'Contribuyente Ordinario'}
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
            {company.name}
          </h2>
          <div className="text-xs font-semibold text-slate-700 font-mono">
            RIF: {company.rif}
          </div>
          <div className="text-[10px] text-slate-500 max-w-md ml-auto truncate">
            {company.address}
          </div>
        </div>
      </div>

      {/* Report Title Banner */}
      <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
            {reportTitle}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-slate-600 font-medium">{subtitle}</p>
          )}
        </div>

        <div className="text-right text-[11px] font-mono-nums">
          {periodText && (
            <div className="font-semibold text-slate-800">{periodText}</div>
          )}
          <div className="text-slate-500 text-[10px]">
            Tasa Oficial BCV: <span className="font-bold text-slate-700">Bs. {company.bcvRate.toFixed(2)}/$</span>
          </div>
        </div>
      </div>
    </div>
  );
};
