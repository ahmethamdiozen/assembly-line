-- TM50 montaj hattı — fabrikanın SQL Server'ı ("bize verilecek olan"; varsayım).
-- PLC, tork controller'ları, vision sistemi ve ağ geçidi bu tablolara yazar; bizim collector sadece OKUR
-- (3–5 dk'da bir, her tablodan Id > son okunan). Gerçek şema gelince collector'daki SELECT'ler eşlenir.
-- Tüm zamanlar UTC. Tablolar sadece eklemelidir (insert-only), Id identity anahtardır.
-- Ayrıntılar: docs/sql-veri-sozlesmesi.md

IF OBJECT_ID('dbo.SchemaInfo') IS NULL
CREATE TABLE dbo.SchemaInfo (
  Version int NOT NULL
);
GO

-- OP005: motor seri numarası ve iş emri oluşur
IF OBJECT_ID('dbo.MotorRegistry') IS NULL
CREATE TABLE dbo.MotorRegistry (
  Id           bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  MotorSerial  varchar(30)   NOT NULL,
  WorkOrderNo  varchar(30)   NOT NULL,
  Variant      nvarchar(40)  NOT NULL,
  CreatedUtc   datetime2(3)  NOT NULL,
  INDEX IX_MotorRegistry_Serial (MotorSerial)
);
GO

-- İstasyon durum değişimi (sadece değişince): 1 RUNNING, 2 STARVED, 3 BLOCKED, 4 FAULT, 5 STOPPED
IF OBJECT_ID('dbo.StationEvents') IS NULL
CREATE TABLE dbo.StationEvents (
  Id           bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  StationCode  varchar(10)   NOT NULL,
  EventUtc     datetime2(3)  NOT NULL,
  StateCode    tinyint       NOT NULL,
  FaultCode    varchar(20)   NULL,
  FaultText    nvarchar(100) NULL,
  INDEX IX_StationEvents_Time (StationCode, EventUtc)
);
GO

-- Motor × istasyon operasyon başlangıcı / bitişi
IF OBJECT_ID('dbo.OperationEvents') IS NULL
CREATE TABLE dbo.OperationEvents (
  Id           bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  MotorSerial  varchar(30)   NOT NULL,
  StationCode  varchar(10)   NOT NULL,
  EventType    varchar(5)    NOT NULL,  -- START / END
  EventUtc     datetime2(3)  NOT NULL,
  OperatorNo   varchar(20)   NULL,      -- insanlı istasyonda teknisyen sicil no
  Result       varchar(3)    NULL,      -- END'de: OK / NOK
  INDEX IX_OperationEvents_Serial (MotorSerial),
  INDEX IX_OperationEvents_Time (EventUtc)
);
GO

-- Seri numaralı komponent okutmaları (barkod / QR / RFID)
IF OBJECT_ID('dbo.ComponentScans') IS NULL
CREATE TABLE dbo.ComponentScans (
  Id               bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  MotorSerial      varchar(30)  NOT NULL,
  StationCode      varchar(10)  NOT NULL,
  ComponentType    varchar(10)  NOT NULL,  -- GKS, MBL, KRK, PCS, KBL, ALT, MRS
  ComponentSerial  varchar(40)  NOT NULL,
  LotNo            varchar(40)  NULL,
  ScanUtc          datetime2(3) NOT NULL,
  OperatorNo       varchar(20)  NULL,
  INDEX IX_ComponentScans_Serial (MotorSerial),
  INDEX IX_ComponentScans_Component (ComponentSerial)
);
GO

-- Tork controller sonuçları (her joint için bir satır; retry ayrı satır)
IF OBJECT_ID('dbo.TighteningResults') IS NULL
CREATE TABLE dbo.TighteningResults (
  Id            bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  ResultUtc     datetime2(3)  NOT NULL,
  MotorSerial   varchar(30)   NOT NULL,
  StationCode   varchar(10)   NOT NULL,
  ControllerId  varchar(30)   NOT NULL,
  ToolId        varchar(30)   NOT NULL,
  Pset          varchar(10)   NOT NULL,
  JointId       varchar(10)   NOT NULL,
  TargetNm      decimal(8,2)  NOT NULL,
  MinNm         decimal(8,2)  NOT NULL,
  MaxNm         decimal(8,2)  NOT NULL,
  TorqueNm      decimal(8,2)  NOT NULL,
  AngleDeg      decimal(8,1)  NOT NULL,
  Result        varchar(3)    NOT NULL,  -- OK / NOK
  INDEX IX_TighteningResults_Serial (MotorSerial),
  INDEX IX_TighteningResults_Time (ResultUtc)
);
GO

-- OP100 vision kararı ve görüntüler
IF OBJECT_ID('dbo.VisionResults') IS NULL
CREATE TABLE dbo.VisionResults (
  Id            bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  InspectionId  varchar(50)   NOT NULL UNIQUE,
  ResultUtc     datetime2(3)  NOT NULL,
  MotorSerial   varchar(30)   NOT NULL,
  Decision      varchar(4)    NOT NULL,  -- OK / NOK / HOLD
  DefectCode    varchar(20)   NULL,
  DefectText    nvarchar(100) NULL,
  INDEX IX_VisionResults_Serial (MotorSerial)
);
GO
IF OBJECT_ID('dbo.VisionImages') IS NULL
CREATE TABLE dbo.VisionImages (
  Id            bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  InspectionId  varchar(50)   NOT NULL,
  CapturedUtc   datetime2(3)  NOT NULL,
  ViewName      nvarchar(40)  NOT NULL,
  ImagePath     nvarchar(260) NOT NULL,  -- görüntü deposundaki yol (NAS / dosya sunucusu)
  INDEX IX_VisionImages_Inspection (InspectionId)
);
GO

-- Ön montaj sayaçları (dakikada bir; üretim günü başında sıfırlanır) ve supermarket buffer stoğu
IF OBJECT_ID('dbo.SubassemblyCounters') IS NULL
CREATE TABLE dbo.SubassemblyCounters (
  Id             bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  CellCode       varchar(10)  NOT NULL,
  SampleUtc      datetime2(3) NOT NULL,
  ProducedTotal  int          NOT NULL,
  NokTotal       int          NOT NULL,
  BufferQty      int          NOT NULL,
  INDEX IX_SubassemblyCounters_Time (CellCode, SampleUtc)
);
GO

-- Ağ geçidinin yazdığı cihaz bağlantı durumu (dakikada bir)
IF OBJECT_ID('dbo.DeviceHeartbeats') IS NULL
CREATE TABLE dbo.DeviceHeartbeats (
  Id           bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  DeviceId     varchar(30)  NOT NULL,
  DeviceType   varchar(12)  NOT NULL,  -- PLC / CONTROLLER / TOOL / CAMERA
  StationCode  varchar(10)  NOT NULL,
  SampleUtc    datetime2(3) NOT NULL,
  Online       bit          NOT NULL,
  INDEX IX_DeviceHeartbeats_Time (SampleUtc)
);
GO

-- İstasyon sensör / IO sinyalleri (sadece değişince)
IF OBJECT_ID('dbo.IoSignals') IS NULL
CREATE TABLE dbo.IoSignals (
  Id           bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  StationCode  varchar(10)   NOT NULL,
  SignalName   nvarchar(40)  NOT NULL,
  Value        bit           NOT NULL,
  SampleUtc    datetime2(3)  NOT NULL
);
GO
