import { Popover, Table, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import type { ShellView } from "@/app/shared/schemas/shell";
import {
  formatDateTime,
  formatLongDate,
  formatTime,
} from "@/app/shared/utils/dates";
import { formatSince } from "@/app/shared/utils/format";
import type { Item } from "@/features/items/shared/schemas/items";

// The row is terse and the popover is exact, which is what gives the short and
// long formats each a place to be seen.
const short = (formats: ShellView, date: Date | null) =>
  date === null ? "—" : formatDateTime(formats, date);

const long = (formats: ShellView, date: Date | null) =>
  date === null
    ? "—"
    : `${formatLongDate(formats.longDateFormat, date)} ${formatTime(formats.timeFormat, date)}`;

// Its own component so the three long dates are formatted only once the
// popover opens, not for every row on every render.
const Timestamps = ({ item, formats }: { item: Item; formats: ShellView }) => (
  <Table withRowBorders={false}>
    <Table.Tbody>
      <Table.Tr>
        <Table.Td>Created</Table.Td>
        <Table.Td>{long(formats, item.createdAt)}</Table.Td>
      </Table.Tr>
      <Table.Tr>
        <Table.Td>Updated</Table.Td>
        <Table.Td>{long(formats, item.updatedAt)}</Table.Td>
      </Table.Tr>
      <Table.Tr>
        <Table.Td>Completed</Table.Td>
        <Table.Td>{long(formats, item.completedAt)}</Table.Td>
      </Table.Tr>
    </Table.Tbody>
  </Table>
);

// Computed at render with no ticker: every mutation invalidates the loader,
// which re-renders this.
export const ItemTime = ({ item }: { item: Item }) => {
  const [opened, popover] = useDisclosure(false);
  const formats = useDateFormats();
  const shown =
    item.completed && item.completedAt ? item.completedAt : item.updatedAt;

  return (
    <Popover
      opened={opened}
      onChange={(next) => (next ? popover.open() : popover.close())}
      withArrow
      shadow="md">
      <Popover.Target>
        <UnstyledButton
          aria-label={`Show timestamps for ${item.name}`}
          onClick={popover.toggle}>
          <Text size="sm" c="dimmed">
            {formats.showRelativeDates
              ? formatSince(shown)
              : short(formats, shown)}
          </Text>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Timestamps item={item} formats={formats} />
      </Popover.Dropdown>
    </Popover>
  );
};
