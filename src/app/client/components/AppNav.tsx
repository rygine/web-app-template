import { Collapse, NavLink } from "@mantine/core";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Fragment } from "react";

import { useLayout } from "@/app/client/contexts/layout";
import { nav } from "@/app/nav";
import type { NavItem } from "@/app/shared/utils/nav";

import classes from "./AppNav.module.css";

const keyFor = (item: NavItem) => `${item.to}|${item.label}`;

export const AppNav = () => {
  const matchRoute = useMatchRoute();
  const { closeNav } = useLayout();

  const isActive = (item: NavItem) =>
    Boolean(
      matchRoute({ to: item.to, search: item.search, includeSearch: true }),
    );

  const link = (
    item: NavItem,
    active: boolean,
    nested: boolean,
    sectionActive: boolean,
  ) => (
    <NavLink
      key={keyFor(item)}
      renderRoot={(props) => (
        <Link
          {...props}
          to={item.to}
          search={
            sectionActive
              ? item.search
                ? (prev) => ({ ...prev, ...item.search, page: 1 })
                : (prev) => prev
              : undefined
          }
        />
      )}
      label={item.label}
      active={active}
      className={nested ? classes.subLink : undefined}
      pl={nested ? "xl" : undefined}
      py={nested ? 8 : undefined}
      fz={nested ? "xs" : undefined}
      onClick={closeNav}
    />
  );

  return (
    <>
      {nav.map((item) => {
        const children = item.children ?? [];
        const sectionActive = Boolean(matchRoute({ to: item.to, fuzzy: true }));
        return (
          <Fragment key={keyFor(item)}>
            {link(
              item,
              children.length > 0 ? sectionActive : isActive(item),
              false,
              sectionActive,
            )}
            {children.length > 0 && (
              <Collapse expanded={sectionActive}>
                {children.map((child) =>
                  link(child, isActive(child), true, sectionActive),
                )}
              </Collapse>
            )}
          </Fragment>
        );
      })}
    </>
  );
};
