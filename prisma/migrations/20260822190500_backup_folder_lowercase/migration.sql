-- The default changed from 'Backups' to 'backups'. Changing a column default
-- leaves existing rows alone, so an instance created before this would keep the
-- old folder and look as though the change had not landed.
--
-- Only rows still holding the *old default* are rewritten: a row equal to it
-- has almost certainly never been edited, and one naming anything else is a
-- deliberate choice this must not overwrite.
UPDATE "Setting" SET "backupFolder" = 'backups' WHERE "backupFolder" = 'Backups';
