export default function AILoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-5 w-5 animate-pulse rounded bg-muted" />
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="h-16 w-16 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
