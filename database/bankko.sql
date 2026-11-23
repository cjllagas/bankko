
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

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `bankko` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;

USE `bankko`;
DROP TABLE IF EXISTS `account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `account` (
  `Account_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) NOT NULL,
  `Account_Number` varchar(20) NOT NULL,
  `Account_Type` enum('Savings','Checking') NOT NULL,
  `Balance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `Date_Opened` datetime NOT NULL,
  `Status` enum('Active','Inactive','Frozen') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Account_ID`),
  UNIQUE KEY `IDX_e6cd4f56610ba54821b43ad529` (`Account_Number`),
  KEY `FK_9f62d347876b0d0e9c2e47ab014` (`User_ID`),
  CONSTRAINT `FK_9f62d347876b0d0e9c2e47ab014` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_ID`) ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `account` DISABLE KEYS */;
INSERT INTO `account` VALUES
(1,1,'1002-3350-4471','Savings',15250.75,'2026-11-23 12:21:19','Active'),
(2,2,'1002-3350-4472','Checking',8200.00,'2026-11-23 12:21:19','Active'),
(3,3,'1002-3350-4473','Savings',52000.00,'2026-11-23 12:21:19','Active');
/*!40000 ALTER TABLE `account` ENABLE KEYS */;
DROP TABLE IF EXISTS `admin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin` (
  `Admin_ID` int(11) NOT NULL AUTO_INCREMENT,
  `First_Name` varchar(50) NOT NULL,
  `Last_Name` varchar(50) NOT NULL,
  `Email` varchar(100) NOT NULL,
  `Phone_Number` varchar(15) NOT NULL,
  `Password` varchar(255) NOT NULL,
  `Status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `Failed_Attempts` int(11) NOT NULL DEFAULT 0,
  `Locked_Until` datetime DEFAULT NULL,
  `Date_Created` datetime NOT NULL,
  PRIMARY KEY (`Admin_ID`),
  UNIQUE KEY `IDX_426df095ae1dd4e9c9316eaac3` (`Email`),
  UNIQUE KEY `IDX_21562b9b60a6edc995039f7e26` (`Phone_Number`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `admin` DISABLE KEYS */;
INSERT INTO `admin` VALUES
(1,'Ana','Reyes','ana.reyes@bankko.example','09170000001','$2b$10$Yfa3LnV8IQCuZlK0q.9BWOHH33ooLDs8tSHBJgY3pHsxwoSPEydkG','Active',0,NULL,'2026-11-23 12:21:19');
/*!40000 ALTER TABLE `admin` ENABLE KEYS */;
DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `Log_ID` bigint(20) NOT NULL AUTO_INCREMENT,
  `Actor_Type` enum('User','Admin','System') NOT NULL,
  `Actor_ID` int(11) DEFAULT NULL,
  `Action` varchar(40) NOT NULL,
  `Entity_Type` varchar(30) DEFAULT NULL,
  `Entity_ID` int(11) DEFAULT NULL,
  `IP_Address` varchar(45) DEFAULT NULL,
  `Created_At` datetime NOT NULL,
  PRIMARY KEY (`Log_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
DROP TABLE IF EXISTS `biller`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `biller` (
  `Biller_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Biller_Name` varchar(100) NOT NULL,
  `Category` varchar(50) NOT NULL,
  `Status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Biller_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `biller` DISABLE KEYS */;
INSERT INTO `biller` VALUES
(1,'Meralco','Utilities','Active'),
(2,'Maynilad','Utilities','Active'),
(3,'PLDT','Telecom','Active'),
(4,'Old Cable Co.','Telecom','Inactive');
/*!40000 ALTER TABLE `biller` ENABLE KEYS */;
DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification` (
  `Notification_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) NOT NULL,
  `Transaction_ID` int(11) DEFAULT NULL,
  `Type` enum('Email','SMS') NOT NULL,
  `Message` varchar(255) NOT NULL,
  `Date_Sent` datetime NOT NULL,
  `Status` enum('Sent','Failed') NOT NULL DEFAULT 'Sent',
  PRIMARY KEY (`Notification_ID`),
  KEY `FK_a7a88153fd0f0dc3998c9dbcf22` (`User_ID`),
  KEY `FK_f25582ea482aae6dfc25941c4b2` (`Transaction_ID`),
  CONSTRAINT `FK_a7a88153fd0f0dc3998c9dbcf22` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_ID`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_f25582ea482aae6dfc25941c4b2` FOREIGN KEY (`Transaction_ID`) REFERENCES `transaction` (`Transaction_ID`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `notification` DISABLE KEYS */;
INSERT INTO `notification` VALUES
(1,1,1,'SMS','You sent PHP 500.00 to account 1002-3350-4472. Ref: BNK-20261022-000123.','2026-11-23 12:21:19','Sent');
/*!40000 ALTER TABLE `notification` ENABLE KEYS */;
DROP TABLE IF EXISTS `payee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `payee` (
  `Payee_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Account_ID` int(11) NOT NULL,
  `Biller_ID` int(11) NOT NULL,
  `Biller_Account_Number` varchar(50) NOT NULL,
  `Nickname` varchar(50) DEFAULT NULL,
  `Date_Added` datetime NOT NULL,
  `Status` enum('Active','Removed') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Payee_ID`),
  UNIQUE KEY `IDX_25e0ae59d440ba029735b71915` (`Account_ID`,`Biller_ID`,`Biller_Account_Number`),
  KEY `FK_042d9eab86dbd9ea298ff5b70e7` (`Biller_ID`),
  CONSTRAINT `FK_042d9eab86dbd9ea298ff5b70e7` FOREIGN KEY (`Biller_ID`) REFERENCES `biller` (`Biller_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_714be935d77c26218e7334b28a9` FOREIGN KEY (`Account_ID`) REFERENCES `account` (`Account_ID`) ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `payee` DISABLE KEYS */;
INSERT INTO `payee` VALUES
(1,1,1,'123456789','Home electricity','2026-11-23 12:21:19','Active');
/*!40000 ALTER TABLE `payee` ENABLE KEYS */;
DROP TABLE IF EXISTS `token_denylist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `token_denylist` (
  `Jti` varchar(32) NOT NULL,
  `Expires_At` datetime NOT NULL,
  PRIMARY KEY (`Jti`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `token_denylist` DISABLE KEYS */;
/*!40000 ALTER TABLE `token_denylist` ENABLE KEYS */;
DROP TABLE IF EXISTS `transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction` (
  `Transaction_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Account_ID` int(11) NOT NULL,
  `Destination_Account_ID` int(11) DEFAULT NULL,
  `Payee_ID` int(11) DEFAULT NULL,
  `Reviewed_By_Admin_ID` int(11) DEFAULT NULL,
  `Transaction_Type` enum('Transfer','BillPayment') NOT NULL,
  `Amount` decimal(12,2) NOT NULL,
  `Transaction_Date` datetime NOT NULL,
  `Reference_Number` varchar(30) NOT NULL,
  `Status` enum('Pending','Completed','Failed') NOT NULL DEFAULT 'Completed',
  `Review_Status` enum('None','Flagged','Cleared') NOT NULL DEFAULT 'None',
  `Review_Note` varchar(255) DEFAULT NULL,
  `Reviewed_At` datetime DEFAULT NULL,
  `Idempotency_Key` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`Transaction_ID`),
  UNIQUE KEY `IDX_c3c446f6a2ca05c96ccd6bb49c` (`Reference_Number`),
  UNIQUE KEY `IDX_0db73e4061b81fb8e3b1ccb462` (`Account_ID`,`Idempotency_Key`),
  KEY `FK_dfe500fdb964454673080bdbab2` (`Destination_Account_ID`),
  KEY `FK_5f56dc042a4f2fcb87f4862ef2d` (`Payee_ID`),
  KEY `FK_fa6cba406f68d030b3c584cf77c` (`Reviewed_By_Admin_ID`),
  CONSTRAINT `FK_5f56dc042a4f2fcb87f4862ef2d` FOREIGN KEY (`Payee_ID`) REFERENCES `payee` (`Payee_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_c64e0093db328e173b47f084075` FOREIGN KEY (`Account_ID`) REFERENCES `account` (`Account_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_dfe500fdb964454673080bdbab2` FOREIGN KEY (`Destination_Account_ID`) REFERENCES `account` (`Account_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_fa6cba406f68d030b3c584cf77c` FOREIGN KEY (`Reviewed_By_Admin_ID`) REFERENCES `admin` (`Admin_ID`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `transaction` DISABLE KEYS */;
INSERT INTO `transaction` VALUES
(1,1,2,NULL,NULL,'Transfer',500.00,'2026-11-23 12:21:19','BNK-20261022-000123','Completed','None',NULL,NULL,'seed-transfer-0001');
/*!40000 ALTER TABLE `transaction` ENABLE KEYS */;
DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `User_ID` int(11) NOT NULL AUTO_INCREMENT,
  `First_Name` varchar(50) NOT NULL,
  `Last_Name` varchar(50) NOT NULL,
  `Email` varchar(100) NOT NULL,
  `Phone_Number` varchar(15) NOT NULL,
  `Password` varchar(255) NOT NULL,
  `Failed_Attempts` int(11) NOT NULL DEFAULT 0,
  `Locked_Until` datetime DEFAULT NULL,
  `Date_Registered` datetime NOT NULL,
  PRIMARY KEY (`User_ID`),
  UNIQUE KEY `IDX_b7eee57d84fb7ed872e660197f` (`Email`),
  UNIQUE KEY `IDX_d3e983c3a2fc7f8d70ada412b6` (`Phone_Number`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES
(1,'Juan','Dela Cruz','juan.delacruz@email.com','09171234567','$2b$10$Yfa3LnV8IQCuZlK0q.9BWOHH33ooLDs8tSHBJgY3pHsxwoSPEydkG',0,NULL,'2026-11-23 12:21:19'),
(2,'Maria','Santos','maria.santos@email.com','09181234567','$2b$10$Yfa3LnV8IQCuZlK0q.9BWOHH33ooLDs8tSHBJgY3pHsxwoSPEydkG',0,NULL,'2026-11-23 12:21:19'),
(3,'Pedro','Garcia','pedro.garcia@email.com','09191234567','$2b$10$Yfa3LnV8IQCuZlK0q.9BWOHH33ooLDs8tSHBJgY3pHsxwoSPEydkG',0,NULL,'2026-11-23 12:21:19');
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

