import {
  Button,
  Group,
  SegmentedControl,
  Stack,
  Table,
  VisuallyHidden,
} from "@mantine/core";
import { Link, getRouteApi } from "@tanstack/react-router";

import { PageControls } from "@/app/client/components/PageControls";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import { ItemRow } from "@/features/items/client/components/ItemRow";
import { NewItemRow } from "@/features/items/client/components/NewItemRow";
import { ITEM_PAGE_SIZES } from "@/features/items/shared/schemas/items";
import type { ItemStatus } from "@/features/items/shared/schemas/items";

import classes from "./ItemList.module.css";

const route = getRouteApi("/items");

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incomplete", label: "Incomplete" },
  { value: "complete", label: "Complete" },
];

export const ItemList = ({ creating = false }: { creating?: boolean }) => {
  const { items, total, pageCount } = route.useLoaderData();
  const { page, size, status } = route.useSearch();
  const navigate = route.useNavigate();

  return (
    <ContentLayout title="Items">
      <Stack>
        <Group justify="space-between" wrap="wrap">
          <SegmentedControl
            // The theme's primary colour rather than a name, so a theme with a
            // different `primaryColor` carries this control with it.
            color="var(--mantine-primary-color-filled)"
            aria-label="Filter by status"
            value={status}
            data={STATUS_OPTIONS}
            onChange={(next) => {
              // The filter describes the list, so picking one leaves the
              // creation row behind.
              void navigate({
                to: "/items",
                search: (prev) => ({ ...prev, status: next, page: 1 }),
              });
            }}
          />
          <Button
            renderRoot={(buttonProps) => (
              <Link {...buttonProps} to="/items/new" search={(prev) => prev} />
            )}>
            Add item
          </Button>
        </Group>
        <PageControls
          page={page}
          size={size}
          sizes={ITEM_PAGE_SIZES}
          count={items.length}
          total={total}
          pageCount={pageCount}
          label="Pagination"
          onPage={(next) => {
            void navigate({ search: (prev) => ({ ...prev, page: next }) });
          }}
          onSize={(next) => {
            void navigate({
              search: (prev) => ({ ...prev, size: next, page: 1 }),
            });
          }}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className={classes.doneColumn}>
                  <VisuallyHidden>Done</VisuallyHidden>
                </Table.Th>
                <Table.Th className={classes.nameColumn}>Name</Table.Th>
                <Table.Th className={classes.timeColumn}>
                  Last activity
                </Table.Th>
                <Table.Th className={classes.actionsColumn}>
                  <VisuallyHidden>Actions</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {creating && <NewItemRow />}
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </Table.Tbody>
          </Table>
        </PageControls>
      </Stack>
    </ContentLayout>
  );
};
