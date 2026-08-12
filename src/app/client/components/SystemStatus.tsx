import { Code, Stack, Table, Text, Title } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";

import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import { formatBytes, formatSince } from "@/app/shared/utils/format";

const route = getRouteApi("/system");

const Rows = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <Table withRowBorders={false}>
    <Table.Tbody>
      {rows.map(([label, value]) => (
        <Table.Tr key={label}>
          <Table.Td w="40%">
            <Text size="sm" c="dimmed">
              {label}
            </Text>
          </Table.Td>
          <Table.Td>{value}</Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);

export const SystemStatus = () => {
  const system = route.useLoaderData();

  return (
    <ContentLayout title="System">
      <Stack gap="xl">
        <Stack>
          <Title order={2} size="h4">
            Instance
          </Title>
          <Rows
            rows={[
              [
                "Name",
                <Text key="n" size="sm">
                  {system.instanceName}
                </Text>,
              ],
              ["Version", <Code key="v">{system.version}</Code>],
              [
                "Running since",
                <Text key="u" size="sm">
                  {formatSince(system.startedAt)}
                </Text>,
              ],
              ["Package", <Code key="p">{system.appName}</Code>],
            ]}
          />
        </Stack>

        <Stack>
          <Title order={2} size="h4">
            Runtime
          </Title>
          <Rows
            rows={[
              ["Node", <Code key="n">{system.node}</Code>],
              ["Platform", <Code key="p">{system.platform}</Code>],
            ]}
          />
        </Stack>

        <Stack>
          <Title order={2} size="h4">
            Storage
          </Title>
          <Rows
            rows={[
              ["Data directory", <Code key="d">{system.dataDir}</Code>],
              ["Logs directory", <Code key="l">{system.logsDir}</Code>],
              [
                "Database size",
                <Text key="s" size="sm">
                  {formatBytes(system.databaseBytes)}
                </Text>,
              ],
              [
                "Log entries",
                <Text key="c" size="sm">
                  {system.logCount.toLocaleString()}
                </Text>,
              ],
            ]}
          />
        </Stack>

        <Stack>
          <Title order={2} size="h4">
            Database
          </Title>
          <Rows
            rows={[
              [
                "Latest migration",
                <Code key="m">{system.latestMigration ?? "none"}</Code>,
              ],
              [
                "Migrations applied",
                <Text key="c" size="sm">
                  {system.migrationCount}
                </Text>,
              ],
            ]}
          />
        </Stack>
      </Stack>
    </ContentLayout>
  );
};
