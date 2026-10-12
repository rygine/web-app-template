// A form field's text, or "" when it is missing or a file.
export const fieldText = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
