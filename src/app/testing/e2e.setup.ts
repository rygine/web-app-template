import { E2E_DIR, migrateInto } from "@/app/testing/db";

export default () => {
  migrateInto(E2E_DIR);
};
