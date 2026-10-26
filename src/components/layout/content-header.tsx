export function ContentHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 pb-8 text-center sm:px-6">
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 text-muted-foreground">{description}</p>}
    </div>
  );
}
