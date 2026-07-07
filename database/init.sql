CREATE DATABASE IF NOT EXISTS `site_spono` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `site_spono`;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sites` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `slug` VARCHAR(180) NOT NULL,
  `active_deployment_id` CHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sites_slug` (`slug`),
  KEY `idx_sites_user_id` (`user_id`),
  KEY `idx_sites_updated_at` (`updated_at`),
  CONSTRAINT `fk_sites_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deployments` (
  `id` CHAR(36) NOT NULL,
  `site_id` CHAR(36) NOT NULL,
  `version` INT UNSIGNED NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `root_path` VARCHAR(1024) NOT NULL,
  `file_count` INT UNSIGNED NOT NULL,
  `total_bytes` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deployments_site_version` (`site_id`, `version`),
  KEY `idx_deployments_site_id` (`site_id`),
  KEY `idx_deployments_created_at` (`created_at`),
  CONSTRAINT `fk_deployments_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `domains` (
  `id` CHAR(36) NOT NULL,
  `site_id` CHAR(36) NOT NULL,
  `hostname` VARCHAR(253) NOT NULL,
  `status` ENUM('pending', 'verified', 'failed') NOT NULL DEFAULT 'pending',
  `cname_target` VARCHAR(253) NOT NULL,
  `last_checked_at` DATETIME DEFAULT NULL,
  `last_error` VARCHAR(512) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_domains_hostname` (`hostname`),
  KEY `idx_domains_site_id` (`site_id`),
  KEY `idx_domains_status` (`status`),
  CONSTRAINT `fk_domains_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `generation_jobs` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `requested_site_id` CHAR(36) DEFAULT NULL,
  `status` ENUM('queued', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'queued',
  `error_message` VARCHAR(512) DEFAULT NULL,
  `result_site_id` CHAR(36) DEFAULT NULL,
  `result_deployment_id` CHAR(36) DEFAULT NULL,
  `generated_site_name` VARCHAR(160) DEFAULT NULL,
  `generated_summary` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_generation_jobs_user_id` (`user_id`),
  KEY `idx_generation_jobs_status` (`status`),
  KEY `idx_generation_jobs_created_at` (`created_at`),
  CONSTRAINT `fk_generation_jobs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
