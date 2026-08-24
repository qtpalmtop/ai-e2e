-- AlterTable
ALTER TABLE `cases` ADD COLUMN `locked_at` DATETIME(3) NULL,
    ADD COLUMN `locked_by_user_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `cases_locked_by_user_id_idx` ON `cases`(`locked_by_user_id`);

-- AddForeignKey
ALTER TABLE `cases` ADD CONSTRAINT `cases_locked_by_user_id_fkey` FOREIGN KEY (`locked_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
