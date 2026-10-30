import type { DemoCategory } from "@/lib/demo-data";

export function BoardPreview({ categories }: { categories: DemoCategory[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[640px] gap-1.5 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))`,
        }}
      >
        {categories.map((category) => (
          <div
            key={category.title}
            className="flex min-h-14 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-secondary/70 p-2 text-center font-display text-[10px] font-bold uppercase leading-tight tracking-wide text-secondary-foreground ring-1 ring-foreground/10 sm:text-xs"
          >
            {category.title}
          </div>
        ))}

        {categories[0]?.questions.map((_, qi) => (
          <div key={qi} className="contents">
            {categories.map((category) => (
              <div
                key={category.title + qi}
                className="flex aspect-[4/3] items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),var(--secondary)_35%)] font-mono text-base font-extrabold text-primary-foreground ring-1 ring-foreground/10 sm:text-xl"
              >
                {category.questions[qi].value}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
