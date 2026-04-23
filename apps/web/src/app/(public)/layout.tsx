export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="public-fluid">
      {children}
    </main>
  );
}
