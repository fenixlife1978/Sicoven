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
    <div className="w-full pb-4 border-b-2 border-slate-900 mb-4 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        {/* Left: Company Logo */}
        <div className="flex-shrink-0">
          {logo && (
            <img
              src={logo}
              alt={company.name}
              className="h-10 sm:h-14 md:h-16 w-auto object-contain max-w-[160px] sm:max-w-[220px]"
            />
          )}
        </div>

        {/* Center / Right: Company Info and Official Title */}
        <div className="flex-1 text-left sm:text-right min-w-0">
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-700">
            {company.taxpayerType === 'ESPECIAL' ? 'Contribuyente Especial SENIAT' : 'Contribuyente Ordinario'}
          </div>
          <h2 className="text-sm sm:text-base md:text-lg font-black text-slate-900 uppercase tracking-tight break-words">
            {company.name}
          </h2>
          <div className="text-[11px] sm:text-xs font-semibold text-slate-700 font-mono">
            RIF: {company.rif}
          </div>
          <div className="text-[10px] text-slate-500 max-w-md sm:ml-auto truncate">
            {company.address}
          </div>
        </div>
      </div>

      {/* Report Title Banner */}
      <div className="mt-3 pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm md:text-base font-black text-slate-900 uppercase tracking-wide break-words">
            {reportTitle}
          </h1>
          {subtitle && (
            <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium break-words">{subtitle}</p>
          )}
        </div>

        <div className="text-left sm:text-right text-[10px] sm:text-[11px] font-mono-nums flex-shrink-0">
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
