'use client';

import { BankDetailsClient } from '@/components/hr/BankDetailsClient';
import { GraphExperience, type GraphSectionNode } from '@/components/genz/GraphExperience';
import { TaxDocumentsClient } from '@/components/hr/TaxDocumentsClient';
import { UkTaxDetailsClient } from '@/components/hr/UkTaxDetailsClient';

type Props = {
  orgId: string;
  subjectUserId: string;
  actorUserId: string;
  centerLabel: string;
  centerDescription: string;
  nodes: GraphSectionNode[];
  bankRows: Array<{
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    is_active: boolean;
    account_holder_display: string;
    account_number_last4: string | null;
    sort_code_last4: string | null;
    iban_last4: string | null;
    bank_country: string | null;
    currency: string | null;
    effective_from: string | null;
    submitted_by: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_note: string | null;
    created_at: string;
  }>;
  ukTaxRows: Array<{
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    is_active: boolean;
    ni_number_masked: string | null;
    ni_number_last2: string | null;
    tax_code_masked: string | null;
    tax_code_last2: string | null;
    effective_from: string | null;
    review_note: string | null;
    created_at: string;
  }>;
  taxDocRows: Array<{
    id: string;
    document_type: 'p45' | 'p60';
    tax_year: string | null;
    issue_date: string | null;
    payroll_period_end: string | null;
    status: 'draft' | 'final' | 'issued';
    finance_reference: string | null;
    wagesheet_id: string | null;
    payroll_run_reference: string | null;
    bucket_id: string;
    storage_path: string;
    file_name: string;
    byte_size: number;
    is_current: boolean;
    created_at: string;
  }>;
  canPayrollBankViewAll: boolean;
  canPayrollBankManageAll: boolean;
  canPayrollBankExport: boolean;
  canUkTaxViewAll: boolean;
  canUkTaxManageAll: boolean;
  canUkTaxExport: boolean;
  canTaxDocsViewAll: boolean;
  canTaxDocsManageAll: boolean;
  canTaxDocsExport: boolean;
};

export function EmployeeHrRecordGenZClient({
  orgId,
  subjectUserId,
  actorUserId,
  centerLabel,
  centerDescription,
  nodes,
  bankRows,
  ukTaxRows,
  taxDocRows,
  canPayrollBankViewAll,
  canPayrollBankManageAll,
  canPayrollBankExport,
  canUkTaxViewAll,
  canUkTaxManageAll,
  canUkTaxExport,
  canTaxDocsViewAll,
  canTaxDocsManageAll,
  canTaxDocsExport,
}: Props) {
  return (
    <>
      <GraphExperience
        title="HR File Graph"
        subtitle="Interactive HR mode. Select a node to inspect and directly edit payroll modules in the sidebar."
        centerLabel={centerLabel}
        centerDescription={centerDescription}
        nodes={nodes}
        fullScreen
        showDefaultNodeHrefAction={false}
        hideHeader
        borderless
        renderSidebar={(selected) => {
          if (!selected) return null;
          if (selected.id === 'bank-node') {
            return (
              <div className="genz-inline-editor">
                <h3 className="mb-3 text-[15px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
                  Edit bank details
                </h3>
                <BankDetailsClient
                  title="Bank details (payroll)"
                  description="Masked by default. Full reveal and export are audited."
                  subjectUserId={subjectUserId}
                  initialRows={bankRows}
                  permissions={{
                    viewAll: canPayrollBankViewAll,
                    manageAll: canPayrollBankManageAll,
                    viewOwn: false,
                    manageOwn: false,
                    canExport: canPayrollBankExport,
                  }}
                />
              </div>
            );
          }
          if (selected.id === 'uk-tax-node') {
            return (
              <div className="genz-inline-editor">
                <h3 className="mb-3 text-[15px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
                  Edit UK tax details
                </h3>
                <UkTaxDetailsClient
                  subjectUserId={subjectUserId}
                  initialRows={ukTaxRows}
                  permissions={{
                    viewAll: canUkTaxViewAll,
                    manageAll: canUkTaxManageAll,
                    viewOwn: false,
                    manageOwn: false,
                    canExport: canUkTaxExport,
                  }}
                />
              </div>
            );
          }
          if (selected.id === 'tax-docs-node') {
            return (
              <div className="genz-inline-editor">
                <h3 className="mb-3 text-[15px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
                  Edit tax documents
                </h3>
                <TaxDocumentsClient
                  orgId={orgId}
                  subjectUserId={subjectUserId}
                  actorUserId={actorUserId}
                  initialDocs={taxDocRows}
                  permissions={{
                    viewAll: canTaxDocsViewAll,
                    manageAll: canTaxDocsManageAll,
                    viewOwn: false,
                    uploadOwn: false,
                    canExport: canTaxDocsExport,
                  }}
                />
              </div>
            );
          }
          return undefined;
        }}
      />
      <style jsx global>{`
        .genz-inline-editor .bg-white,
        .genz-inline-editor [class*='bg-[#faf'],
        .genz-inline-editor [class*='bg-[#f5'] {
          background: var(--org-brand-surface) !important;
        }
      `}</style>
    </>
  );
}
