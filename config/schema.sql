-- Vision Board Tasks Table
CREATE TABLE IF NOT EXISTS `vision_board_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(255),
  `user_name` VARCHAR(255),
  `email` VARCHAR(255),
  `card_id` VARCHAR(255) NOT NULL,
  `tasks` JSON NOT NULL,
  `theme` VARCHAR(255) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `user_id_index` (`user_id`),
  INDEX `card_id_index` (`card_id`),
  INDEX `theme_index` (`theme`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS `vision_board_user_card_idx` ON `vision_board_tasks` (`user_id`, `card_id`);

-- Add foreign key if users table exists
-- ALTER TABLE `vision_board_tasks`
--   ADD CONSTRAINT `fk_vision_board_user`
--   FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
--   ON DELETE CASCADE
--   ON UPDATE CASCADE; 