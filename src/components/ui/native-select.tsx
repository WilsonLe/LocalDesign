import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
export function NativeSelect({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="native-select-wrap" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-input bg-background px-2 py-1 pr-7 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={12} />
    </div>
  );
}
