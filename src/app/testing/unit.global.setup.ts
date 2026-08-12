import { rmSync } from "node:fs";

import { TEMPLATE_DIR, TEST_ROOT, migrateInto } from "@/app/testing/db";

export default () => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  migrateInto(TEMPLATE_DIR);
};
