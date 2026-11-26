-- Bankko: email change (customer) and admin-started password reset.
-- Only needed for a database you already created. With DB_SYNC=true the server adds both changes by itself on start;
-- a fresh import of database/bankko.sql already contains them. Run this once (MySQL 8 / MariaDB):
USE `bankko`;

ALTER TABLE `user` ADD COLUMN `Token_Version` int(11) NOT NULL DEFAULT 0 AFTER `Locked_Until`;

CREATE TABLE `credential_request` (
  `Request_ID` varchar(32) NOT NULL,
  `User_ID` int(11) NOT NULL,
  `Purpose` enum('EmailChange','PasswordReset') NOT NULL,
  `New_Email` varchar(100) DEFAULT NULL,
  `Requested_By_Admin_ID` int(11) DEFAULT NULL,
  `Code_Hash` varchar(64) NOT NULL,
  `Attempts` int(11) NOT NULL DEFAULT 0,
  `Expires_At` datetime NOT NULL,
  `Last_Sent_At` datetime NOT NULL,
  `Consumed_At` datetime DEFAULT NULL,
  `Created_At` datetime NOT NULL,
  PRIMARY KEY (`Request_ID`),
  KEY `FK_d18f3ed15e9c464349990f6dae2` (`User_ID`),
  KEY `FK_5e5c43ee7faeaebb54713082559` (`Requested_By_Admin_ID`),
  CONSTRAINT `FK_5e5c43ee7faeaebb54713082559` FOREIGN KEY (`Requested_By_Admin_ID`) REFERENCES `admin` (`Admin_ID`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `FK_d18f3ed15e9c464349990f6dae2` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_ID`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
