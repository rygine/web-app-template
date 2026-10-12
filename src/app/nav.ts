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
      { to: "/system/logs", label: "Logs", order: 40 },
    ],
  },
  {
    to: "/settings",
    label: "Settings",
    order: 90,
    children: [
      { to: "/settings/general", label: "General", order: 10 },
      { to: "/settings/security", label: "Security", order: 20 },
      { to: "/settings/backups", label: "Backups", order: 30 },
      { to: "/settings/ui", label: "UI", order: 40 },
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

// A feature item with the same `to` as another adds its children to that item.
const merge = (items: NavItem[]) =>
  items.reduce<NavItem[]>((merged, item) => {
    const existing = merged.find((other) => other.to === item.to);
    if (existing === undefined) {
      return [...merged, item];
    }
    return merged.map((other) =>
      other === existing
        ? {
            ...other,
            children: [...(other.children ?? []), ...(item.children ?? [])],
          }
        : other,
    );
  }, []);

export const nav: NavItem[] = merge([
  ...appNav,
  ...Object.values(featureNav).flatMap((module) => module.nav),
])
  .toSorted(byOrder)
  .map(sortChildren);
