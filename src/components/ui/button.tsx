
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,color,opacity] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none min-h-[44px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:opacity-90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:opacity-90",
        outline:
          "border border-input bg-background hover:bg-muted hover:text-foreground active:opacity-90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:opacity-90",
        ghost: "hover:bg-muted hover:text-foreground active:opacity-90",
        link: "text-primary underline-offset-4 hover:underline active:opacity-90",
        /** Geen shadcn-kleuren — project `.btn.btn--*` in index.css */
        unstyled: "",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  "aria-label"?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    // Enhanced accessibility
    const enhancedProps = {
      ...props,
      disabled: props.disabled || loading,
      "aria-disabled": props.disabled || loading,
      "aria-busy": loading,
      role: props.role || "button",
      tabIndex: props.tabIndex ?? 0,
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        // Native <button> already handles Enter/Space. preventDefault on a
        // type="submit" control blocks form submit and often has no onClick.
        if (asChild && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          if (!props.disabled && !loading) {
            props.onClick?.(e as any);
          }
        }
        props.onKeyDown?.(e);
      },
    };

    // Project-knoppen (.btn.btn--*): alleen layout/size, geen shadcn variant-kleuren
    const usesProjectBtnClass =
      typeof className === "string" &&
      /\bbtn--(?:primary|secondary|danger|edit|icon|outline)\b/.test(className);
    const finalClassName = usesProjectBtnClass
      ? cn(className, buttonVariants({ size, variant: "unstyled" }))
      : cn(buttonVariants({ variant, size, className }));
    
    return (
      <Comp
        className={finalClassName}
        ref={ref}
        {...enhancedProps}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
