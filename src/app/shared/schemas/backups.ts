import { z } from "zod";

import type { JobView } from "@/app/shared/schemas/jobs";

export const backupNameSchema = z.object({
  name: z
    .string({ error: "A backup name is required." })
    .min(1, "A backup name is required."),
});

export type BackupFile = {
  name: string;
  size: number;
  createdAt: Date;
};

export type BackupsView = {
  files: BackupFile[];
  job: JobView;
};
