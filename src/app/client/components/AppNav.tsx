import { Collapse, NavLink } from "@mantine/core";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Fragment } from "react";

import { useLayout } from "@/app/client/contexts/layout";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { nav } from "@/app/nav";
import { logout } from "@/app/rpc";
import type { NavItem } from "@/app/shared/utils/nav";

import classes from "./AppNav.module.css";

const keyFor = (item: NavItem) => `${item.to}|${item.label}`;

export const AppNav = () => {
  const matchRoute = useMatchRoute();
  const { closeNav } = useLayout();
  const { run } = useAsyncAction({ toast: true });

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

  const logoutLink = (
    <NavLink
      renderRoot={(props) => <button type="button" {...props} />}
      label="Log out"
      className={classes.subLink}
      pl="xl"
      py={8}
      fz="xs"
      onClick={() =>
        void run(async () => {
          await logout();
          // A full load, so no page keeps data from the session that ended.
          window.location.assign("/login");
        }, "Could not log out.")
      }
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
                {item.to === "/system" && logoutLink}
              </Collapse>
            )}
          </Fragment>
        );
      })}
    </>
  );
};
