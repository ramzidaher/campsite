export default function MainLoading() {
  return (
    <div
      className="min-h-[50vh] animate-pulse px-4 py-8 md:px-8"
      aria-busy
      aria-label="Loading"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-48 rounded-md bg-[#d8d8d8]/80" />
        <div className="h-4 w-full max-w-xl rounded bg-[#d8d8d8]/60" />
        <div className="h-4 w-full max-w-lg rounded bg-[#d8d8d8]/50" />
        <div className="space-y-3 pt-6">
          <div className="h-24 rounded-xl bg-[#d8d8d8]/40" />
          <div className="h-24 rounded-xl bg-[#d8d8d8]/35" />
        </div>
      </div>
    </div>
  );
}
