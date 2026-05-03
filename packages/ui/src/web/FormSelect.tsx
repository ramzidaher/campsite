'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { campusBorder, campusFocusRing } from './campusTokens';

const formSelectVariants = cva(
  [
    'w-full appearance-none rounded-lg border outline-none',
    campusBorder.hairline,
    campusFocusRing,
    'font-sans disabled:cursor-not-allowed disabled:opacity-50',
    'leading-none',
  ].join(' '),
  {
    variants: {
      controlSize: {
        sm: 'h-8 pl-3 pr-8 text-[12px]',
        md: 'h-9 pl-3 pr-9 text-[13px]',
        lg: 'h-10 pl-3 pr-10 text-[14px]',
      },
      tone: {
        surface: 'border-[#d8d8d8] bg-white text-[#121212]',
        canvas: 'border-[#d8d8d8] bg-[#faf9f6] text-[#121212]',
        /** Uses CSS variables from `.founder-hq-root` (or any host that defines --surface2, --border, --text2). */
        subtle:
          'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--text2)] focus:border-[color:var(--text2)] focus:shadow-none',
      },
      hasLeading: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      { controlSize: 'sm', hasLeading: true, class: 'pl-7 pr-8' },
      { controlSize: 'md', hasLeading: true, class: 'pl-8 pr-9' },
      { controlSize: 'lg', hasLeading: true, class: 'pl-9 pr-10' },
    ],
    defaultVariants: {
      controlSize: 'md',
      tone: 'surface',
      hasLeading: false,
    },
  }
);

const chevronVariants = cva('pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 shrink-0', {
  variants: {
    controlSize: {
      sm: 'right-2.5 h-3.5 w-3.5',
      md: 'right-3 h-4 w-4',
      lg: 'right-3 h-[18px] w-[18px]',
    },
    tone: {
      surface: 'text-[#6b6b6b]',
      canvas: 'text-[#6b6b6b]',
      subtle: 'text-[color:var(--text2)] opacity-80',
    },
  },
  defaultVariants: {
    controlSize: 'md',
    tone: 'surface',
  },
});

type FormSelectVariantProps = Omit<VariantProps<typeof formSelectVariants>, 'hasLeading'>;

export type FormSelectProps = Omit<React.ComponentPropsWithoutRef<'select'>, 'size'> &
  FormSelectVariantProps & {
    /** Optional left adornment (e.g. status dot), absolutely positioned. */
    leading?: React.ReactNode;
    /** Extra classes merged onto the native `<select>`. */
    className?: string;
    /** Classes on the outer wrapper (rare). */
    wrapperClassName?: string;
  };

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  function FormSelect(
    {
      controlSize = 'md',
      tone = 'surface',
      leading,
      className,
      wrapperClassName,
      children,
      disabled,
      ...rest
    },
    ref
  ) {
    const hasLeading = Boolean(leading);
    const selectClass = formSelectVariants({ controlSize, tone, hasLeading });
    const chevronClass = chevronVariants({ controlSize, tone });

    return (
      <div
        className={['relative inline-block min-w-0 w-full', wrapperClassName].filter(Boolean).join(' ')}
      >
        {leading ? (
          <span
            className="pointer-events-none absolute left-3 top-1/2 z-[2] flex -translate-y-1/2 items-center justify-center [&>*]:leading-none"
            aria-hidden
          >
            {leading}
          </span>
        ) : null}
        <select
          ref={ref}
          disabled={disabled}
          className={[selectClass, className].filter(Boolean).join(' ')}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className={chevronClass} aria-hidden strokeWidth={2} />
      </div>
    );
  }
);

FormSelect.displayName = 'FormSelect';
