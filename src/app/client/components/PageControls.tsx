import { Group, Pagination, Select, Text } from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./PageControls.module.css";

// Mantine gives the edge controls an icon and no accessible name.
const CONTROL_LABELS = {
  first: "First page",
  previous: "Previous page",
  next: "Next page",
  last: "Last page",
} as const;

// The "Showing x–y of z" row above a paged table and the pager below it, so
// every list pages the same way. The table itself is the children.
export const PageControls = ({
  page,
  size,
  sizes,
  count,
  total,
  pageCount,
  label,
  onPage,
  onSize,
  children,
}: {
  page: number;
  size: number;
  sizes: readonly number[];
  count: number;
  total: number;
  pageCount: number;
  label: string;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  children: ReactNode;
}) => {
  // Derived from what is on screen, not from the page number: ?page=99 is
  // reachable and would otherwise read "Showing 981–12 of 12".
  const first = count === 0 ? 0 : (page - 1) * size + 1;
  const last = count === 0 ? 0 : first + count - 1;

  return (
    <>
      <Group justify="space-between" wrap="wrap">
        <Text>
          Showing {first}–{last} of {total}
        </Text>
        <Select
          label="per page"
          checkIconPosition="right"
          inputWrapperOrder={["input", "label"]}
          classNames={{ root: classes.pageSize }}
          value={String(size)}
          data={sizes.map(String)}
          allowDeselect={false}
          onChange={(next) => {
            if (next !== null) {
              onSize(Number(next));
            }
          }}
        />
      </Group>
      {children}
      {pageCount > 1 && (
        <Group justify="center">
          <nav aria-label={label}>
            <Pagination
              withEdges
              value={page}
              total={pageCount}
              getControlProps={(control) => ({
                "aria-label": CONTROL_LABELS[control],
              })}
              onChange={onPage}
            />
          </nav>
        </Group>
      )}
    </>
  );
};
