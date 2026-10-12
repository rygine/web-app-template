import type { NavItem } from "@/app/shared/utils/nav";

export const nav: NavItem[] = [
  {
    to: "/items",
    label: "Items",
    order: 10,
    search: { status: "all" },
    children: [
      {
        to: "/items",
        label: "Incomplete",
        order: 20,
        search: { status: "incomplete" },
      },
      {
        to: "/items",
        label: "Complete",
        order: 30,
        search: { status: "complete" },
      },
    ],
  },
];
