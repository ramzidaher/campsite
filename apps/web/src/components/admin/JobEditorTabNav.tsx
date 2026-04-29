'use client';

import Link from 'next/link';

type JobEditorTab = {
  id: 'information' | 'applicants' | 'admin_legal';
  label: string;
  href: string;
};

const tabs: JobEditorTab[] = [
  { id: 'information', label: 'Job information', href: '' },
  { id: 'applicants', label: 'Applicants', href: 'applications' },
  { id: 'admin_legal', label: 'Admin and legal', href: 'admin-legal' },
];

export function JobEditorTabNav({
  jobId,
  activeTab,
}: {
  jobId: string;
  activeTab: JobEditorTab['id'];
}) {
  return (
    <div role="tablist" aria-label="Job editor sections" className="flex flex-wrap items-center gap-2">
      {tabs.map((tab) => {
        const href = tab.href ? `/hr/jobs/${jobId}/${tab.href}` : `/hr/jobs/${jobId}/edit`;
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={[
              'rounded-full border px-5 py-2 text-[13px] font-medium transition-colors',
              isActive
                ? 'border-[#121212] bg-[#121212] text-white'
                : 'border-[#d8d8d8] bg-[#f5f4f1] text-[#121212] hover:bg-white',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
