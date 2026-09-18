import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
const variants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-5 [&_svg]:shrink-0', {
  variants: { variant: { default: 'bg-primary text-primary-foreground hover:brightness-110', secondary: 'bg-secondary text-secondary-foreground hover:bg-muted', ghost: 'text-foreground hover:bg-secondary', outline: 'border border-border text-foreground hover:bg-secondary' }, size: { default: 'h-12 px-6', sm: 'h-11 px-4', icon: 'size-12' } }, defaultVariants: { variant: 'default', size: 'default' },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => { const Comp = asChild ? Slot : 'button'; return <Comp ref={ref} className={cn(variants({ variant, size, className }))} {...props} />; });
Button.displayName = 'Button';
