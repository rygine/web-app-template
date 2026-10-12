import { ActionIcon, useMantineColorScheme } from "@mantine/core";
import { MoonIcon } from "@phosphor-icons/react/Moon";
import { SunIcon } from "@phosphor-icons/react/Sun";

// The icon names the scheme a click switches to, not the one in effect.
//
// Both buttons render and CSS hides one, because the resolved scheme is
// unknowable during SSR under defaultColorScheme="auto" — branching on it here
// would be a hydration mismatch. Each label is fixed to its own button for the
// same reason, so neither depends on the scheme either.
export const ThemeToggle = () => {
  const { toggleColorScheme } = useMantineColorScheme();

  return (
    <>
      <ActionIcon
        variant="default"
        size="md"
        darkHidden
        onClick={toggleColorScheme}
        aria-label="Switch to dark theme">
        <MoonIcon size={16} />
      </ActionIcon>
      <ActionIcon
        variant="default"
        size="md"
        lightHidden
        onClick={toggleColorScheme}
        aria-label="Switch to light theme">
        <SunIcon size={16} />
      </ActionIcon>
    </>
  );
};
