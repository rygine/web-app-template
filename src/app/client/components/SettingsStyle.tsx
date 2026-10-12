import { Stack, Text, Title, useMantineColorScheme } from "@mantine/core";
import { z } from "zod";

import { SettingSelect } from "@/app/client/components/SettingSelect";
import { useLayout } from "@/app/client/contexts/layout";
import {
  LAYOUT_WIDTH_OPTIONS,
  layoutWidthSchema,
} from "@/app/shared/utils/width";

const colorSchemeSchema = z.enum(["auto", "light", "dark"]);

const THEMES: { value: z.infer<typeof colorSchemeSchema>; label: string }[] = [
  { value: "auto", label: "Match the system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Neither of these is a stored setting, and that is deliberate: how much screen
// there is and which theme the system uses are properties of the device, not of
// the instance. They write to the same places the navbar controls do.
export const SettingsStyle = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { width, setWidth } = useLayout();

  return (
    <Stack>
      <Title order={2} size="h4">
        Style
      </Title>
      <Text size="sm" c="dimmed">
        These two apply at once and are remembered by this browser alone, so a
        phone and a desktop can differ.
      </Text>

      <SettingSelect
        label="Theme"
        data={THEMES}
        value={colorScheme}
        schema={colorSchemeSchema}
        maw={260}
        onChange={setColorScheme}
      />

      <SettingSelect
        label="Content width"
        data={LAYOUT_WIDTH_OPTIONS}
        value={width}
        schema={layoutWidthSchema}
        maw={260}
        onChange={setWidth}
      />
    </Stack>
  );
};
