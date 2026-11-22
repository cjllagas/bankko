
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account` (
  `Account_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) NOT NULL,
  `Account_Number` varchar(20) NOT NULL,
  `Account_Type` enum('Savings','Checking') NOT NULL,
  `Balance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `Date_Opened` datetime NOT NULL DEFAULT current_timestamp(),
  `Status` enum('Active','Inactive','Frozen') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Account_ID`),
  UNIQUE KEY `uq_account_number` (`Account_Number`),
  KEY `ix_account_user` (`User_ID`),
  CONSTRAINT `fk_account_user` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_ID`),
  CONSTRAINT `ck_account_balance` CHECK (`Balance` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=206 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `admin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin` (
  `Admin_ID` int(11) NOT NULL AUTO_INCREMENT,
  `First_Name` varchar(50) NOT NULL,
  `Last_Name` varchar(50) NOT NULL,
  `Email` varchar(100) NOT NULL,
  `Phone_Number` varchar(15) NOT NULL,
  `Password` varchar(255) NOT NULL COMMENT 'bcrypt/Argon2 hash only',
  `Failed_Attempts` tinyint(4) NOT NULL DEFAULT 0,
  `Locked_Until` datetime DEFAULT NULL,
  `Status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Admin_ID`),
  UNIQUE KEY `uq_admin_email` (`Email`),
  UNIQUE KEY `uq_admin_phone` (`Phone_Number`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_log` (
  `Log_ID` bigint(20) NOT NULL AUTO_INCREMENT,
  `Actor_Type` enum('User','Admin','System') NOT NULL,
  `Actor_ID` int(11) DEFAULT NULL,
  `Action` varchar(40) NOT NULL,
  `Entity_Type` varchar(30) DEFAULT NULL,
  `Entity_ID` int(11) DEFAULT NULL,
  `IP_Address` varchar(45) DEFAULT NULL,
  `Created_At` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`Log_ID`),
  KEY `ix_audit_actor` (`Actor_Type`,`Actor_ID`),
  KEY `ix_audit_action` (`Action`),
  KEY `ix_audit_created` (`Created_At`)
) ENGINE=InnoDB AUTO_INCREMENT=9050 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `biller`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `biller` (
  `Biller_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Biller_Name` varchar(100) NOT NULL,
  `Category` varchar(50) NOT NULL,
  `Status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Biller_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification` (
  `Notification_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) NOT NULL,
  `Transaction_ID` int(11) NOT NULL,
  `Type` enum('Email','SMS') NOT NULL,
  `Message` varchar(255) NOT NULL,
  `Date_Sent` datetime NOT NULL DEFAULT current_timestamp(),
  `Status` enum('Sent','Failed') NOT NULL DEFAULT 'Sent',
  PRIMARY KEY (`Notification_ID`),
  KEY `ix_notif_user` (`User_ID`),
  KEY `ix_notif_txn` (`Transaction_ID`),
  CONSTRAINT `fk_notif_txn` FOREIGN KEY (`Transaction_ID`) REFERENCES `transaction` (`Transaction_ID`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=802 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `otp_challenge`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `otp_challenge` (
  `Challenge_ID` varchar(32) NOT NULL,
  `Actor_Type` enum('User','Admin') NOT NULL,
  `Actor_ID` int(11) NOT NULL,
  `Otp_Hash` varchar(255) NOT NULL,
  `Attempts_Left` tinyint(4) NOT NULL DEFAULT 3,
  `Expires_At` datetime NOT NULL,
  PRIMARY KEY (`Challenge_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payee` (
  `Payee_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Account_ID` int(11) NOT NULL,
  `Biller_ID` int(11) NOT NULL,
  `Biller_Account_Number` varchar(50) NOT NULL,
  `Nickname` varchar(50) DEFAULT NULL,
  `Date_Added` datetime NOT NULL DEFAULT current_timestamp(),
  `Status` enum('Active','Removed') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Payee_ID`),
  UNIQUE KEY `uq_payee_triple` (`Account_ID`,`Biller_ID`,`Biller_Account_Number`),
  KEY `ix_payee_biller` (`Biller_ID`),
  CONSTRAINT `fk_payee_account` FOREIGN KEY (`Account_ID`) REFERENCES `account` (`Account_ID`),
  CONSTRAINT `fk_payee_biller` FOREIGN KEY (`Biller_ID`) REFERENCES `biller` (`Biller_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rate_limit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rate_limit` (
  `Limit_Key` varchar(100) NOT NULL,
  `Hits` int(11) NOT NULL DEFAULT 0,
  `Window_Start` datetime NOT NULL,
  PRIMARY KEY (`Limit_Key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `step_up`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `step_up` (
  `StepUp_ID` varchar(32) NOT NULL,
  `User_ID` int(11) NOT NULL,
  `Otp_Hash` varchar(255) NOT NULL,
  `Token_Hash` varchar(255) DEFAULT NULL,
  `Used` tinyint(1) NOT NULL DEFAULT 0,
  `Expires_At` datetime NOT NULL,
  PRIMARY KEY (`StepUp_ID`),
  KEY `fk_stepup_user` (`User_ID`),
  CONSTRAINT `fk_stepup_user` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `token_denylist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `token_denylist` (
  `Jti` varchar(40) NOT NULL,
  `Expires_At` datetime NOT NULL,
  PRIMARY KEY (`Jti`),
  KEY `ix_deny_exp` (`Expires_At`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transaction` (
  `Transaction_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Account_ID` int(11) NOT NULL,
  `Destination_Account_ID` int(11) DEFAULT NULL,
  `Payee_ID` int(11) DEFAULT NULL,
  `Reviewed_By_Admin_ID` int(11) DEFAULT NULL,
  `Transaction_Type` enum('Transfer','BillPayment') NOT NULL,
  `Amount` decimal(12,2) NOT NULL,
  `Transaction_Date` datetime NOT NULL DEFAULT current_timestamp(),
  `Reference_Number` varchar(30) NOT NULL,
  `Status` enum('Pending','Completed','Failed') NOT NULL DEFAULT 'Pending',
  `Idempotency_Key` varchar(64) DEFAULT NULL,
  `Review_Status` enum('None','Flagged','Cleared') NOT NULL DEFAULT 'None',
  `Review_Note` varchar(255) DEFAULT NULL,
  `Reviewed_At` datetime DEFAULT NULL,
  PRIMARY KEY (`Transaction_ID`),
  UNIQUE KEY `uq_txn_reference` (`Reference_Number`),
  UNIQUE KEY `uq_txn_idem` (`Account_ID`,`Idempotency_Key`),
  KEY `ix_txn_dest` (`Destination_Account_ID`),
  KEY `ix_txn_payee` (`Payee_ID`),
  KEY `ix_txn_admin` (`Reviewed_By_Admin_ID`),
  KEY `ix_txn_date` (`Transaction_Date`),
  CONSTRAINT `fk_txn_account` FOREIGN KEY (`Account_ID`) REFERENCES `account` (`Account_ID`),
  CONSTRAINT `fk_txn_admin` FOREIGN KEY (`Reviewed_By_Admin_ID`) REFERENCES `admin` (`Admin_ID`),
  CONSTRAINT `fk_txn_dest` FOREIGN KEY (`Destination_Account_ID`) REFERENCES `account` (`Account_ID`),
  CONSTRAINT `fk_txn_payee` FOREIGN KEY (`Payee_ID`) REFERENCES `payee` (`Payee_ID`),
  CONSTRAINT `ck_txn_amount` CHECK (`Amount` > 0),
  CONSTRAINT `ck_txn_shape` CHECK (`Transaction_Type` = 'Transfer' and `Destination_Account_ID` is not null and `Payee_ID` is null or `Transaction_Type` = 'BillPayment' and `Payee_ID` is not null and `Destination_Account_ID` is null),
  CONSTRAINT `ck_txn_not_self` CHECK (`Destination_Account_ID` is null or `Account_ID` <> `Destination_Account_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=5002 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user` (
  `User_ID` int(11) NOT NULL AUTO_INCREMENT,
  `First_Name` varchar(50) NOT NULL,
  `Last_Name` varchar(50) NOT NULL,
  `Email` varchar(100) NOT NULL,
  `Phone_Number` varchar(15) NOT NULL,
  `Password` varchar(255) NOT NULL COMMENT 'bcrypt/Argon2 hash only',
  `Failed_Attempts` tinyint(4) NOT NULL DEFAULT 0,
  `Locked_Until` datetime DEFAULT NULL,
  `Date_Registered` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`User_ID`),
  UNIQUE KEY `uq_user_email` (`Email`),
  UNIQUE KEY `uq_user_phone` (`Phone_Number`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

