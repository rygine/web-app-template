import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { UnsavedChangesModal } from "@/app/client/components/UnsavedChangesModal";
import { useSettingsForm } from "@/app/client/hooks/useSettingsForm";
import { ContentLayout } from "@/app/client/layouts/ContentLayout";
import type { RuntimeView } from "@/app/shared/schemas/runtime";
import type { Settings } from "@/app/shared/schemas/settings";

const route = getRouteApi("/settings");

type SettingsForm = {
  settings: Settings;
  runtime: RuntimeView;
  commit: (patch: Partial<Settings>) => void;
  commitNow: (patch: Partial<Settings>) => void;
  flush: () => Promise<boolean>;
};

export const SettingsPage = ({
  title,
  children,
}: {
  title: string;
  children: (form: SettingsForm) => ReactNode;
}) => {
  const { settings, runtime } = route.useLoaderData();
  const { commit, commitNow, flush, blocker } = useSettingsForm();

  return (
    <ContentLayout title={title}>
      {children({ settings, runtime, commit, commitNow, flush })}
      <UnsavedChangesModal blocker={blocker} />
    </ContentLayout>
  );
};
