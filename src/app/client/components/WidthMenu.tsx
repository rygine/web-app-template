import { ActionIcon, Menu } from "@mantine/core";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { LayoutIcon } from "@phosphor-icons/react/Layout";

import { useLayout } from "@/app/client/contexts/layout";
import { LAYOUT_WIDTH_OPTIONS } from "@/app/shared/utils/width";

import classes from "./WidthMenu.module.css";

export const WidthMenu = () => {
  const { width, setWidth } = useLayout();

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="md"
          visibleFrom="sm"
          aria-label="Content width">
          <LayoutIcon size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {LAYOUT_WIDTH_OPTIONS.map((option) => (
          <Menu.Item
            key={option.value}
            // Menu.Item forces role="menuitem", so aria-checked would be
            // invalid here; aria-current is valid on any element and is what
            // carries the selection to a screen reader.
            aria-current={option.value === width}
            className={classes.item}
            classNames={{ itemSection: classes.check }}
            rightSection={<CheckIcon size={14} />}
            onClick={() => setWidth(option.value)}>
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
