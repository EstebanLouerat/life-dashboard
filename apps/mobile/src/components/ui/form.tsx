import { useState } from "react";
import { Notice } from "./controls";

type Errors<K extends string> = Partial<Record<K, string>>;

/**
 * Field errors for a form, shown under each field. `edit` clears a field's
 * error as it changes; `blur` checks a filled field as soon as it loses
 * focus, so a format mistake shows before submit; `submit` checks
 * everything. Empty required fields are only flagged on submit, never while
 * moving through the form.
 */
export function useFormErrors<K extends string>(validate: () => Errors<K>) {
  const [errors, setErrors] = useState<Errors<K>>({});
  return {
    errors,
    setErrors,
    edit: (key: K, set: (v: string) => void) => (v: string) => {
      set(v);
      if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    },
    blur: (key: K, value: string) => () => {
      if (!value.trim()) return;
      const error = validate()[key];
      if (error) setErrors((e) => ({ ...e, [key]: error }));
    },
    submit: () => {
      const next = validate();
      setErrors(next);
      return Object.keys(next).length === 0;
    },
  };
}

/** Next to the submit button: the fields to fix may be scrolled out of view. */
export function FormErrorSummary({ errors }: { errors: Partial<Record<string, string>> }) {
  const count = Object.values(errors).filter(Boolean).length;
  if (!count) return null;
  return <Notice tone="danger">{count === 1 ? "Un champ à corriger plus haut." : `${count} champs à corriger plus haut.`}</Notice>;
}
