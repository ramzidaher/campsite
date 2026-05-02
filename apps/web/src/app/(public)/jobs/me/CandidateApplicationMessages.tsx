type PortalMessage = { body: string; created_at: string };

export function CandidateApplicationMessages({ messages }: { messages: PortalMessage[] }) {
  return (
    <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Messages from the team</h2>
      {messages.length === 0 ? (
        <p className="mt-2 text-[14px] text-[#6b6b6b]">No messages yet. We’ll post updates here.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {messages.map((m, i) => (
            <li key={`${m.created_at}-${i}`} className="border-t border-[#f0f0f0] pt-3 first:border-t-0 first:pt-0">
              <p className="text-[11px] text-[#9b9b9b]">
                {m.created_at
                  ? new Date(m.created_at).toLocaleString('en-GB', { timeZone: 'UTC', 
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
