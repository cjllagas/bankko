
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
DROP TABLE IF EXISTS `Account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Account` (
  `Account_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) NOT NULL,
  `Account_Number` varchar(20) NOT NULL,
  `Account_Type` enum('Savings','Checking') NOT NULL,
  `Balance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `Date_Opened` datetime NOT NULL,
  `Status` enum('Active','Inactive','Frozen') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Account_ID`),
  UNIQUE KEY `IDX_14e758073d8bbed62658390792` (`Account_Number`),
  KEY `FK_6ec565d68739a48969826b83003` (`User_ID`),
  CONSTRAINT `FK_6ec565d68739a48969826b83003` FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`) ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Account` DISABLE KEYS */;
INSERT INTO `Account` VALUES
(1,1,'1002-3350-4471','Savings',15250.75,'2026-11-23 02:26:57','Active'),
(2,2,'1002-3350-4472','Checking',8200.00,'2026-11-23 02:26:57','Active'),
(3,3,'1002-3350-4473','Savings',52000.00,'2026-11-23 02:26:57','Active');
/*!40000 ALTER TABLE `Account` ENABLE KEYS */;
DROP TABLE IF EXISTS `Admin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Admin` (
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
  UNIQUE KEY `IDX_025526bf69233c00d3e006ff67` (`Email`),
  UNIQUE KEY `IDX_38bba4e72f0b6fe14eff28bf03` (`Phone_Number`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Admin` DISABLE KEYS */;
INSERT INTO `Admin` VALUES
(1,'Ana','Reyes','ana.reyes@bankko.example','09170000001','$2b$10$pRZXHT2Vf5DAaJkwi1IWPuUXhjf7l.3SPxt0ok82MlEqrawRE.GJK','Active',0,NULL,'2026-11-23 02:26:57');
/*!40000 ALTER TABLE `Admin` ENABLE KEYS */;
DROP TABLE IF EXISTS `Audit_Log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Audit_Log` (
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

/*!40000 ALTER TABLE `Audit_Log` DISABLE KEYS */;
/*!40000 ALTER TABLE `Audit_Log` ENABLE KEYS */;
DROP TABLE IF EXISTS `Biller`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Biller` (
  `Biller_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Biller_Name` varchar(100) NOT NULL,
  `Category` varchar(50) NOT NULL,
  `Status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Biller_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Biller` DISABLE KEYS */;
INSERT INTO `Biller` VALUES
(1,'Meralco','Utilities','Active'),
(2,'Maynilad','Utilities','Active'),
(3,'PLDT','Telecom','Active'),
(4,'Old Cable Co.','Telecom','Inactive');
/*!40000 ALTER TABLE `Biller` ENABLE KEYS */;
DROP TABLE IF EXISTS `Notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Notification` (
  `Notification_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) NOT NULL,
  `Transaction_ID` int(11) DEFAULT NULL,
  `Type` enum('Email','SMS') NOT NULL,
  `Message` varchar(255) NOT NULL,
  `Date_Sent` datetime NOT NULL,
  `Status` enum('Sent','Failed') NOT NULL DEFAULT 'Sent',
  PRIMARY KEY (`Notification_ID`),
  KEY `FK_022a1f12c7f181af4b2b7005228` (`User_ID`),
  KEY `FK_da1aafe67c6f04c52f3b8fa6b90` (`Transaction_ID`),
  CONSTRAINT `FK_022a1f12c7f181af4b2b7005228` FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_da1aafe67c6f04c52f3b8fa6b90` FOREIGN KEY (`Transaction_ID`) REFERENCES `Transaction` (`Transaction_ID`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Notification` DISABLE KEYS */;
INSERT INTO `Notification` VALUES
(1,1,1,'SMS','You sent PHP 500.00 to account 1002-3350-4472. Ref: BNK-20261022-000123.','2026-11-23 02:26:57','Sent');
/*!40000 ALTER TABLE `Notification` ENABLE KEYS */;
DROP TABLE IF EXISTS `Payee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Payee` (
  `Payee_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Account_ID` int(11) NOT NULL,
  `Biller_ID` int(11) NOT NULL,
  `Biller_Account_Number` varchar(50) NOT NULL,
  `Nickname` varchar(50) DEFAULT NULL,
  `Date_Added` datetime NOT NULL,
  `Status` enum('Active','Removed') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`Payee_ID`),
  UNIQUE KEY `IDX_750431be52d7e97082e55f5afc` (`Account_ID`,`Biller_ID`,`Biller_Account_Number`),
  KEY `FK_dcd11b692e3c546be00aa32673b` (`Biller_ID`),
  CONSTRAINT `FK_1ccddf5d023fddb5d40b2a4772a` FOREIGN KEY (`Account_ID`) REFERENCES `Account` (`Account_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_dcd11b692e3c546be00aa32673b` FOREIGN KEY (`Biller_ID`) REFERENCES `Biller` (`Biller_ID`) ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Payee` DISABLE KEYS */;
INSERT INTO `Payee` VALUES
(1,1,1,'123456789','Home electricity','2026-11-23 02:26:57','Active');
/*!40000 ALTER TABLE `Payee` ENABLE KEYS */;
DROP TABLE IF EXISTS `Token_Denylist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Token_Denylist` (
  `Jti` varchar(32) NOT NULL,
  `Expires_At` datetime NOT NULL,
  PRIMARY KEY (`Jti`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Token_Denylist` DISABLE KEYS */;
/*!40000 ALTER TABLE `Token_Denylist` ENABLE KEYS */;
DROP TABLE IF EXISTS `Transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Transaction` (
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
  UNIQUE KEY `IDX_120732b02523d81e1e8505fc99` (`Reference_Number`),
  UNIQUE KEY `IDX_6485000ee7e59431b08ad37019` (`Account_ID`,`Idempotency_Key`),
  KEY `FK_bf0c35f26fa2e56acef423c3bcb` (`Destination_Account_ID`),
  KEY `FK_87f3c543070f51495dabe7c3527` (`Payee_ID`),
  KEY `FK_c8e10bcc33dbc6724a711ae11f6` (`Reviewed_By_Admin_ID`),
  CONSTRAINT `FK_87f3c543070f51495dabe7c3527` FOREIGN KEY (`Payee_ID`) REFERENCES `Payee` (`Payee_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_bf0c35f26fa2e56acef423c3bcb` FOREIGN KEY (`Destination_Account_ID`) REFERENCES `Account` (`Account_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_c086b464166a577e99297d1266f` FOREIGN KEY (`Account_ID`) REFERENCES `Account` (`Account_ID`) ON UPDATE NO ACTION,
  CONSTRAINT `FK_c8e10bcc33dbc6724a711ae11f6` FOREIGN KEY (`Reviewed_By_Admin_ID`) REFERENCES `Admin` (`Admin_ID`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `Transaction` DISABLE KEYS */;
INSERT INTO `Transaction` VALUES
(1,1,2,NULL,NULL,'Transfer',500.00,'2026-11-23 02:26:57','BNK-20261022-000123','Completed','None',NULL,NULL,'seed-transfer-0001');
/*!40000 ALTER TABLE `Transaction` ENABLE KEYS */;
DROP TABLE IF EXISTS `User`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `User` (
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
  UNIQUE KEY `IDX_2f56f7040c2b05fc8f08a113f7` (`Email`),
  UNIQUE KEY `IDX_b52339aec8e0f1b538b26d46d2` (`Phone_Number`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40000 ALTER TABLE `User` DISABLE KEYS */;
INSERT INTO `User` VALUES
(1,'Juan','Dela Cruz','juan.delacruz@email.com','09171234567','$2b$10$pRZXHT2Vf5DAaJkwi1IWPuUXhjf7l.3SPxt0ok82MlEqrawRE.GJK',0,NULL,'2026-11-23 02:26:57'),
(2,'Maria','Santos','maria.santos@email.com','09181234567','$2b$10$pRZXHT2Vf5DAaJkwi1IWPuUXhjf7l.3SPxt0ok82MlEqrawRE.GJK',0,NULL,'2026-11-23 02:26:57'),
(3,'Pedro','Garcia','pedro.garcia@email.com','09191234567','$2b$10$pRZXHT2Vf5DAaJkwi1IWPuUXhjf7l.3SPxt0ok82MlEqrawRE.GJK',0,NULL,'2026-11-23 02:26:57');
/*!40000 ALTER TABLE `User` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

