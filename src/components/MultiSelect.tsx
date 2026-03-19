/**
 * MultiSelect — types only.
 * The component implementation lives in onboarding.tsx where ink is loaded dynamically.
 */

export interface MultiSelectItem {
  label: string;
  value: string;
  hint?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  label: string;
  items: MultiSelectItem[];
  defaultSelected?: string[];
  onSubmit: (selected: string[]) => void;
}
