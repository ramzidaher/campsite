'use client';

type SensitiveRecordExportButtonProps = {
  userId: string;
};

export function SensitiveRecordExportButton({ userId }: SensitiveRecordExportButtonProps) {
  return (
    <button
      type="button"
      className="rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-[12.5px] text-[#991b1b] hover:bg-[#fef2f2]"
      onClick={() => {
        const reason = window.prompt('Enter a reason for sensitive export (required):', '')?.trim() ?? '';
        if (!reason) return;
        const url = `/api/hr/records/export?userId=${encodeURIComponent(userId)}&format=csv&includeSensitive=1&reason=${encodeURIComponent(reason)}`;
        window.location.assign(url);
      }}
    >
      Export CSV (sensitive)
    </button>
  );
}

