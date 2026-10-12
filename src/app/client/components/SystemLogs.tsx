import {
  ActionIcon,
  Badge,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { BroomIcon } from "@phosphor-icons/react/Broom";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { EyeIcon } from "@phosphor-icons/react/Eye";
import { FunnelIcon } from "@phosphor-icons/react/Funnel";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { StackIcon } from "@phosphor-icons/react/Stack";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useRef } from "react";

import { PageControls } from "@/app/client/components/PageControls";
import { useAsyncAction } from "@/app/client/hooks/useAsyncAction";
import { useDateFormats } from "@/app/client/hooks/useDateFormats";
import { useModalItem } from "@/app/client/hooks/useModalItem";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import { runJobNow } from "@/app/rpc";
import { LOG_LEVEL_FILTERS, LOG_PAGE_SIZES } from "@/app/shared/schemas/logs";
import type { LogView } from "@/app/shared/schemas/logs";
import { APP_NAME } from "@/app/shared/utils/app";
import { formatDateTime } from "@/app/shared/utils/dates";

import classes from "./SystemLogs.module.css";

const route = getRouteApi("/system/logs");

const SEARCH_DELAY_MS = 300;

const LEVEL_COLORS: Record<string, string> = {
  trace: "gray",
  debug: "cyan",
  info: "teal",
  warn: "yellow",
  error: "red",
};

const hasMeta = (entry: LogView) =>
  Object.keys(entry.fields).length > 0 ||
  entry.errors.length > 0 ||
  entry.requestId !== null;

const metaOf = (entry: LogView) => ({
  fields: entry.fields,
  errors: entry.errors,
  requestId: entry.requestId,
});

const copyText = (entry: LogView) =>
  [
    `[${entry.time.toISOString()}] ${entry.level.toUpperCase()} [${entry.namespace}] ${entry.message}`,
    ...(hasMeta(entry) ? [JSON.stringify(metaOf(entry), null, 2)] : []),
  ].join("\n");

const download = (entries: LogView[]) => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${APP_NAME}-logs-${new Date().toISOString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const SystemLogs = () => {
  const { entries, total, pageCount, sources } = route.useLoaderData();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const router = useRouter();
  const formats = useDateFormats();
  const refresh = useAsyncAction({ toast: true });
  const cleanup = useAsyncAction({ toast: true });
  const meta = useModalItem<LogView>();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggleSource = (source: string) => {
    const next = search.sources.includes(source)
      ? search.sources.filter((other) => other !== source)
      : [...search.sources, source];
    void navigate({
      search: (prev) => ({ ...prev, sources: next, page: 1 }),
    });
  };

  return (
    <ContentLayout title="Logs">
      <Stack>
        <Group gap="xs" wrap="wrap">
          <TextInput
            flex="1 1 12rem"
            aria-label="Search logs"
            placeholder="Search logs..."
            leftSection={<MagnifyingGlassIcon />}
            defaultValue={search.search ?? ""}
            onChange={(event) => {
              const text = event.currentTarget.value.trim();
              clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    search: text === "" ? undefined : text,
                    page: 1,
                  }),
                });
              }, SEARCH_DELAY_MS);
            }}
          />
          <Tooltip label="Download this page">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Download this page"
              onClick={() => download(entries)}>
              <DownloadSimpleIcon />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Level">
                <FunnelIcon />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Level</Menu.Label>
              {LOG_LEVEL_FILTERS.map((level) => (
                <Menu.Item
                  key={level}
                  ff="monospace"
                  c={LEVEL_COLORS[level]}
                  rightSection={search.level === level && <CheckIcon />}
                  onClick={() =>
                    void navigate({
                      search: (prev) => ({ ...prev, level, page: 1 }),
                    })
                  }>
                  {level.toUpperCase()}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end" closeOnItemClick={false}>
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Source">
                <StackIcon />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className={classes.sources}>
              <Menu.Label>Source</Menu.Label>
              {sources.map((source) => (
                <Menu.Item
                  key={source}
                  ff="monospace"
                  rightSection={
                    search.sources.includes(source) && <CheckIcon />
                  }
                  onClick={() => toggleSource(source)}>
                  {source}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Tooltip label="Refresh">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Refresh"
              onClick={() =>
                void refresh.run(
                  () => router.invalidate(),
                  "Could not refresh the logs.",
                )
              }>
              <ArrowClockwiseIcon
                className={refresh.pending ? classes.spin : undefined}
              />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Archive old logs">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Archive old logs"
              loading={cleanup.pending}
              onClick={() =>
                void cleanup.run(async () => {
                  await runJobNow({ data: { name: "archive-logs" } });
                  await router.invalidate();
                }, "Could not archive the logs.")
              }>
              <BroomIcon />
            </ActionIcon>
          </Tooltip>
        </Group>
        <PageControls
          page={search.page}
          size={search.size}
          sizes={LOG_PAGE_SIZES}
          count={entries.length}
          total={total}
          pageCount={pageCount}
          label="Pagination"
          onPage={(next) =>
            void navigate({ search: (prev) => ({ ...prev, page: next }) })
          }
          onSize={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, size: next, page: 1 }),
            })
          }>
          <Table aria-label="Logs" highlightOnHover verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Timestamp</Table.Th>
                <Table.Th>Level</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Message</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" size="sm" ta="center">
                      {search.search === undefined &&
                      search.level === "all" &&
                      search.sources.length === 0
                        ? "No logs found"
                        : "No logs match these filters."}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {entries.map((entry, index) => (
                <Table.Tr key={`${entry.time.getTime()}-${index}`}>
                  <Table.Td className={classes.nowrap}>
                    <Text ff="monospace" size="xs" c="dimmed">
                      {formatDateTime(formats, entry.time)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      radius="sm"
                      color={LEVEL_COLORS[entry.level] ?? "gray"}>
                      {entry.level}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="default"
                      radius="sm"
                      ff="monospace"
                      tt="none">
                      {entry.namespace}
                    </Badge>
                  </Table.Td>
                  <Table.Td className={classes.message}>
                    {entry.message}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <CopyButton value={copyText(entry)}>
                        {({ copied, copy }) => (
                          <ActionIcon
                            variant="default"
                            size="sm"
                            aria-label="Copy log entry"
                            onClick={copy}>
                            {copied ? <CheckIcon /> : <CopyIcon />}
                          </ActionIcon>
                        )}
                      </CopyButton>
                      {hasMeta(entry) && (
                        <ActionIcon
                          variant="default"
                          size="sm"
                          aria-label="View metadata"
                          onClick={() => meta.open(entry)}>
                          <EyeIcon />
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </PageControls>
      </Stack>
      <Modal {...meta.props} title="Log metadata" size="xl">
        {meta.item !== null && (
          <Code block className={classes.meta}>
            {JSON.stringify(metaOf(meta.item), null, 2)}
          </Code>
        )}
      </Modal>
    </ContentLayout>
  );
};
