export type NavItem = {
  to: string;
  label: string;
  order: number;
  search?: Record<string, string>;
  children?: NavItem[];
};
