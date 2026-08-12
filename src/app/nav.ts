import type { NavItem } from "@/app/shared/utils/nav";

const appNav: NavItem[] = [
  {
    to: "/system",
    label: "System",
    order: 80,
    children: [
      { to: "/system", label: "Status", order: 10 },
      { to: "/system/backups", label: "Backups", order: 20 },
      { to: "/system/jobs", label: "Jobs", order: 30 },
    ],
  },
  {
    to: "/settings",
    label: "Settings",
    order: 90,
    children: [
      { to: "/settings/general", label: "General", order: 10 },
      { to: "/settings/ui", label: "UI", order: 20 },
    ],
  },
];

const featureNav = import.meta.glob<{ nav: NavItem[] }>("@/features/*/nav.ts", {
  eager: true,
});

const byOrder = (a: NavItem, b: NavItem) => a.order - b.order;

const sortChildren = (item: NavItem): NavItem => ({
  ...item,
  children: item.children?.toSorted(byOrder),
});

export const nav: NavItem[] = [
  ...appNav,
  ...Object.values(featureNav).flatMap((module) => module.nav),
]
  .toSorted(byOrder)
  .map(sortChildren);
