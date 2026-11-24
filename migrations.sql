IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    CREATE TABLE [Samples] (
        [SampleId] nvarchar(64) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [CreatedBy] nvarchar(128) NOT NULL,
        [WorkflowVersion] nvarchar(16) NOT NULL,
        [State] nvarchar(32) NOT NULL,
        [MicronsPerPixel] float NOT NULL,
        [FramesPerSecond] float NOT NULL,
        [ChamberDepthMicrons] float NOT NULL,
        [RawVideoBlobUri] nvarchar(1024) NULL,
        [DraftReportPdfUri] nvarchar(1024) NULL,
        [FinalReportPdfUri] nvarchar(1024) NULL,
        [IsLocked] bit NOT NULL,
        CONSTRAINT [PK_Samples] PRIMARY KEY ([SampleId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditEvents] (
        [Id] bigint NOT NULL IDENTITY,
        [SampleId] nvarchar(64) NOT NULL,
        [TimestampUtc] datetime2 NOT NULL,
        [Actor] nvarchar(128) NOT NULL,
        [Action] nvarchar(64) NOT NULL,
        [DetailsJson] nvarchar(max) NULL,
        [SampleEntitySampleId] nvarchar(64) NULL,
        CONSTRAINT [PK_AuditEvents] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AuditEvents_Samples_SampleEntitySampleId] FOREIGN KEY ([SampleEntitySampleId]) REFERENCES [Samples] ([SampleId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    CREATE TABLE [ModelRuns] (
        [JobId] nvarchar(128) NOT NULL,
        [SampleId] nvarchar(64) NOT NULL,
        [Service] nvarchar(64) NOT NULL,
        [ModelName] nvarchar(64) NOT NULL,
        [RepoCommit] nvarchar(64) NOT NULL,
        [WeightsSha256] nvarchar(64) NOT NULL,
        [StartedAtUtc] datetime2 NOT NULL,
        [EndedAtUtc] datetime2 NULL,
        [Status] nvarchar(32) NOT NULL,
        [ResultUri] nvarchar(1024) NULL,
        [ErrorCode] nvarchar(max) NULL,
        CONSTRAINT [PK_ModelRuns] PRIMARY KEY ([JobId]),
        CONSTRAINT [FK_ModelRuns_Samples_SampleId] FOREIGN KEY ([SampleId]) REFERENCES [Samples] ([SampleId]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditEvents_SampleEntitySampleId] ON [AuditEvents] ([SampleEntitySampleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditEvents_SampleId_TimestampUtc] ON [AuditEvents] ([SampleId], [TimestampUtc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ModelRuns_SampleId_Service] ON [ModelRuns] ([SampleId], [Service]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120192929_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261120192929_InitialCreate', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120202455_AddBookingAndPartnerEntities'
)
BEGIN
    CREATE TABLE [LabOrders] (
        [OrderId] nvarchar(64) NOT NULL,
        [TrackingNumber] nvarchar(64) NOT NULL,
        [ClinicId] nvarchar(64) NOT NULL,
        [PatientId] nvarchar(128) NOT NULL,
        [CollectionType] nvarchar(32) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [PriceAed] decimal(18,2) NOT NULL,
        [SlotHoldId] nvarchar(64) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NULL,
        [Notes] nvarchar(1024) NULL,
        CONSTRAINT [PK_LabOrders] PRIMARY KEY ([OrderId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120202455_AddBookingAndPartnerEntities'
)
BEGIN
    CREATE TABLE [PartnerClinics] (
        [ClinicId] nvarchar(64) NOT NULL,
        [Name] nvarchar(256) NOT NULL,
        [City] nvarchar(128) NOT NULL,
        [Address] nvarchar(512) NOT NULL,
        [ContactEmail] nvarchar(128) NOT NULL,
        [Phone] nvarchar(64) NOT NULL,
        [LicenseNumber] nvarchar(64) NOT NULL,
        [IsActive] bit NOT NULL,
        [WalkInPriceAed] decimal(18,2) NOT NULL,
        [HomeCollectionPriceAed] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_PartnerClinics] PRIMARY KEY ([ClinicId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120202455_AddBookingAndPartnerEntities'
)
BEGIN
    CREATE TABLE [SlotHolds] (
        [HoldId] nvarchar(64) NOT NULL,
        [SlotId] nvarchar(64) NOT NULL,
        [ClinicId] nvarchar(64) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ExpiresAtUtc] datetime2 NOT NULL,
        [IsClaimed] bit NOT NULL,
        CONSTRAINT [PK_SlotHolds] PRIMARY KEY ([HoldId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120202455_AddBookingAndPartnerEntities'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261120202455_AddBookingAndPartnerEntities', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120203522_AddPatientIntakeAndFollowUpEntities'
)
BEGIN
    CREATE TABLE [DailyCheckIns] (
        [CheckInId] nvarchar(64) NOT NULL,
        [UserId] nvarchar(128) NOT NULL,
        [Mood] nvarchar(64) NULL,
        [EnergyLevel] int NULL,
        [SleepHours] float NULL,
        [Notes] nvarchar(1024) NULL,
        [LoggedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_DailyCheckIns] PRIMARY KEY ([CheckInId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120203522_AddPatientIntakeAndFollowUpEntities'
)
BEGIN
    CREATE TABLE [FollowUpTasks] (
        [TaskId] nvarchar(64) NOT NULL,
        [UserId] nvarchar(128) NOT NULL,
        [Title] nvarchar(256) NOT NULL,
        [IsCompleted] bit NOT NULL,
        [IsSkipped] bit NOT NULL,
        [DueDateUtc] datetime2 NULL,
        [Notes] nvarchar(1024) NULL,
        CONSTRAINT [PK_FollowUpTasks] PRIMARY KEY ([TaskId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120203522_AddPatientIntakeAndFollowUpEntities'
)
BEGIN
    CREATE TABLE [Questionnaires] (
        [Id] nvarchar(64) NOT NULL,
        [UserId] nvarchar(128) NOT NULL,
        [AnswersJson] nvarchar(max) NOT NULL,
        [SubmittedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Questionnaires] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120203522_AddPatientIntakeAndFollowUpEntities'
)
BEGIN
    CREATE TABLE [ScreeningRuns] (
        [RunId] nvarchar(64) NOT NULL,
        [UserId] nvarchar(128) NOT NULL,
        [RiskBand] nvarchar(64) NOT NULL,
        [RecommendationsJson] nvarchar(max) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_ScreeningRuns] PRIMARY KEY ([RunId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120203522_AddPatientIntakeAndFollowUpEntities'
)
BEGIN
    CREATE TABLE [SymptomLogs] (
        [LogId] nvarchar(64) NOT NULL,
        [UserId] nvarchar(128) NOT NULL,
        [SymptomType] nvarchar(128) NOT NULL,
        [Severity] int NOT NULL,
        [Notes] nvarchar(1024) NULL,
        [LoggedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_SymptomLogs] PRIMARY KEY ([LogId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261120203522_AddPatientIntakeAndFollowUpEntities'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261120203522_AddPatientIntakeAndFollowUpEntities', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [Samples] ADD [IsDeleted] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [Samples] ADD [ReportVersion] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [Samples] ADD [ContentSha256] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [Samples] ADD [DataEnterersJson] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [ModelRuns] DROP CONSTRAINT [FK_ModelRuns_Samples_SampleId];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [ModelRuns] ADD CONSTRAINT [FK_ModelRuns_Samples_SampleId] FOREIGN KEY ([SampleId]) REFERENCES [Samples] ([SampleId]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [AuditEvents] DROP CONSTRAINT [FK_AuditEvents_Samples_SampleEntitySampleId];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    DROP INDEX [IX_AuditEvents_SampleEntitySampleId] ON [AuditEvents];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    DECLARE @var0 sysname;
    SELECT @var0 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[AuditEvents]') AND [c].[name] = N'SampleEntitySampleId');
    IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [AuditEvents] DROP CONSTRAINT [' + @var0 + '];');
    ALTER TABLE [AuditEvents] DROP COLUMN [SampleEntitySampleId];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN

                    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditEvents')
                    BEGIN
                        DELETE FROM [AuditEvents] WHERE [SampleId] NOT IN (SELECT [SampleId] FROM [Samples]);
                    END
                    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'ModelRuns')
                    BEGIN
                        DELETE FROM [ModelRuns] WHERE [SampleId] NOT IN (SELECT [SampleId] FROM [Samples]);
                    END
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [AuditEvents] ADD CONSTRAINT [FK_AuditEvents_Samples_SampleId] FOREIGN KEY ([SampleId]) REFERENCES [Samples] ([SampleId]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN

                    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'PartnerClinics')
                    BEGIN
                        INSERT INTO [PartnerClinics] ([ClinicId], [Name], [City], [Address], [ContactEmail], [Phone], [LicenseNumber], [IsActive], [WalkInPriceAed], [HomeCollectionPriceAed])
                        SELECT DISTINCT lo.[ClinicId], CONCAT('Partner Clinic (', lo.[ClinicId], ')'), 'Dubai', 'Dubai Healthcare City', 'admin@penancias.ae', '+9714000000', 'DHA-0000', 1, 350.00, 500.00
                        FROM [LabOrders] lo
                        LEFT JOIN [PartnerClinics] pc ON lo.[ClinicId] = pc.[ClinicId]
                        WHERE pc.[ClinicId] IS NULL;

                        INSERT INTO [PartnerClinics] ([ClinicId], [Name], [City], [Address], [ContactEmail], [Phone], [LicenseNumber], [IsActive], [WalkInPriceAed], [HomeCollectionPriceAed])
                        SELECT DISTINCT sh.[ClinicId], CONCAT('Partner Clinic (', sh.[ClinicId], ')'), 'Dubai', 'Dubai Healthcare City', 'admin@penancias.ae', '+9714000000', 'DHA-0000', 1, 350.00, 500.00
                        FROM [SlotHolds] sh
                        LEFT JOIN [PartnerClinics] pc ON sh.[ClinicId] = pc.[ClinicId]
                        WHERE pc.[ClinicId] IS NULL;
                    END

                    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'LabOrders')
                    BEGIN
                        UPDATE [LabOrders] SET [SlotHoldId] = NULL
                        WHERE [SlotHoldId] IS NOT NULL
                          AND [SlotHoldId] NOT IN (SELECT [HoldId] FROM [SlotHolds]);
                    END
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_LabOrders_ClinicId] ON [LabOrders] ([ClinicId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_LabOrders_SlotHoldId] ON [LabOrders] ([SlotHoldId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_SlotHolds_ClinicId] ON [SlotHolds] ([ClinicId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [LabOrders] ADD CONSTRAINT [FK_LabOrders_PartnerClinics_ClinicId] FOREIGN KEY ([ClinicId]) REFERENCES [PartnerClinics] ([ClinicId]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [LabOrders] ADD CONSTRAINT [FK_LabOrders_SlotHolds_SlotHoldId] FOREIGN KEY ([SlotHoldId]) REFERENCES [SlotHolds] ([HoldId]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    ALTER TABLE [SlotHolds] ADD CONSTRAINT [FK_SlotHolds_PartnerClinics_ClinicId] FOREIGN KEY ([ClinicId]) REFERENCES [PartnerClinics] ([ClinicId]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_Questionnaires_UserId] ON [Questionnaires] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_ScreeningRuns_UserId] ON [ScreeningRuns] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_FollowUpTasks_UserId] ON [FollowUpTasks] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_SymptomLogs_UserId] ON [SymptomLogs] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_DailyCheckIns_UserId] ON [DailyCheckIns] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN

                    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'SlotHolds')
                    BEGIN
                        ;WITH RankedHolds AS (
                            SELECT HoldId, SlotId,
                                   ROW_NUMBER() OVER(PARTITION BY SlotId ORDER BY IsClaimed DESC, CreatedAtUtc DESC) as rn,
                                   FIRST_VALUE(HoldId) OVER(PARTITION BY SlotId ORDER BY IsClaimed DESC, CreatedAtUtc DESC) as KeepHoldId
                            FROM [SlotHolds]
                        )
                        UPDATE lo
                        SET lo.[SlotHoldId] = rh.KeepHoldId
                        FROM [LabOrders] lo
                        JOIN RankedHolds rh ON lo.[SlotHoldId] = rh.HoldId
                        WHERE rh.rn > 1;

                        ;WITH DuplicateHolds AS (
                            SELECT HoldId,
                                   ROW_NUMBER() OVER(PARTITION BY SlotId ORDER BY IsClaimed DESC, CreatedAtUtc DESC) as rn
                            FROM [SlotHolds]
                        )
                        DELETE FROM [SlotHolds]
                        WHERE HoldId IN (SELECT HoldId FROM DuplicateHolds WHERE rn > 1);
                    END
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SlotHolds_SlotId] ON [SlotHolds] ([SlotId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    CREATE INDEX [IX_LabOrders_TrackingNumber] ON [LabOrders] ([TrackingNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121010311_FixAuditAndBookingConstraints'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261121010311_FixAuditAndBookingConstraints', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121152330_AddRawImageBlobUri'
)
BEGIN
    ALTER TABLE [Samples] ADD [RawImageBlobUri] nvarchar(1024) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261121152330_AddRawImageBlobUri'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261121152330_AddRawImageBlobUri', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    DECLARE @var1 sysname;
    SELECT @var1 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Samples]') AND [c].[name] = N'MicronsPerPixel');
    IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [Samples] DROP CONSTRAINT [' + @var1 + '];');
    ALTER TABLE [Samples] ALTER COLUMN [MicronsPerPixel] float NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    DECLARE @var2 sysname;
    SELECT @var2 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Samples]') AND [c].[name] = N'FramesPerSecond');
    IF @var2 IS NOT NULL EXEC(N'ALTER TABLE [Samples] DROP CONSTRAINT [' + @var2 + '];');
    ALTER TABLE [Samples] ALTER COLUMN [FramesPerSecond] float NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    DECLARE @var3 sysname;
    SELECT @var3 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Samples]') AND [c].[name] = N'ChamberDepthMicrons');
    IF @var3 IS NOT NULL EXEC(N'ALTER TABLE [Samples] DROP CONSTRAINT [' + @var3 + '];');
    ALTER TABLE [Samples] ALTER COLUMN [ChamberDepthMicrons] float NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    ALTER TABLE [Samples] ADD [CalibrationId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    ALTER TABLE [Samples] ADD [ChamberTypeId] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    ALTER TABLE [Samples] ADD [ConsentAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    ALTER TABLE [Samples] ADD [ParentSampleId] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    ALTER TABLE [Samples] ADD [WorkflowMode] nvarchar(32) NOT NULL DEFAULT N'prescreen';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE TABLE [Calibrations] (
        [CalibrationId] uniqueidentifier NOT NULL,
        [SampleId] nvarchar(64) NOT NULL,
        [TargetId] nvarchar(64) NOT NULL,
        [ReferencePitchUm] float NOT NULL,
        [MeasuredPitchPx] float NULL,
        [MicronsPerPixel] float NULL,
        [LinesDetected] int NULL,
        [SpacingCvPct] float NULL,
        [ImageWidthPx] int NULL,
        [ImageHeightPx] int NULL,
        [AssetId] uniqueidentifier NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [RejectReason] nvarchar(256) NULL,
        [ToolVersion] nvarchar(32) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ExpiresAtUtc] datetime2 NULL,
        CONSTRAINT [PK_Calibrations] PRIMARY KEY ([CalibrationId]),
        CONSTRAINT [FK_Calibrations_Samples_SampleId] FOREIGN KEY ([SampleId]) REFERENCES [Samples] ([SampleId]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE TABLE [IdempotencyKeys] (
        [Key] nvarchar(128) NOT NULL,
        [SampleId] nvarchar(64) NOT NULL,
        [ResponseJson] nvarchar(max) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_IdempotencyKeys] PRIMARY KEY ([Key], [SampleId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE TABLE [InboxMessages] (
        [MessageId] nvarchar(128) NOT NULL,
        [ReceivedAtUtc] datetime2 NOT NULL,
        [RaisedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_InboxMessages] PRIMARY KEY ([MessageId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE TABLE [MediaAssets] (
        [AssetId] uniqueidentifier NOT NULL,
        [SampleId] nvarchar(64) NOT NULL,
        [Kind] nvarchar(32) NOT NULL,
        [Container] nvarchar(64) NOT NULL,
        [BlobName] nvarchar(256) NOT NULL,
        [ContentTypeDeclared] nvarchar(128) NOT NULL,
        [ContentTypeSniffed] nvarchar(128) NULL,
        [SizeBytes] bigint NOT NULL,
        [Sha256] nvarchar(64) NULL,
        [Status] nvarchar(32) NOT NULL,
        [RejectReason] nvarchar(256) NULL,
        [Fps] float NULL,
        [WidthPx] int NULL,
        [HeightPx] int NULL,
        [Codec] nvarchar(32) NULL,
        [DurationS] float NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_MediaAssets] PRIMARY KEY ([AssetId]),
        CONSTRAINT [FK_MediaAssets_Samples_SampleId] FOREIGN KEY ([SampleId]) REFERENCES [Samples] ([SampleId]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE TABLE [OutboxMessages] (
        [Id] uniqueidentifier NOT NULL,
        [Type] nvarchar(128) NOT NULL,
        [PayloadJson] nvarchar(max) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [DispatchedAtUtc] datetime2 NULL,
        [Attempts] int NOT NULL,
        [LastError] nvarchar(max) NULL,
        CONSTRAINT [PK_OutboxMessages] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE INDEX [IX_Samples_CalibrationId] ON [Samples] ([CalibrationId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE INDEX [IX_Calibrations_AssetId] ON [Calibrations] ([AssetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE INDEX [IX_Calibrations_SampleId] ON [Calibrations] ([SampleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE INDEX [IX_MediaAssets_BlobName] ON [MediaAssets] ([BlobName]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE INDEX [IX_MediaAssets_SampleId] ON [MediaAssets] ([SampleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    CREATE INDEX [IX_OutboxMessages_DispatchedAtUtc] ON [OutboxMessages] ([DispatchedAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    ALTER TABLE [Samples] ADD CONSTRAINT [FK_Samples_Calibrations_CalibrationId] FOREIGN KEY ([CalibrationId]) REFERENCES [Calibrations] ([CalibrationId]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261123194706_Phase1_Foundation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261123194706_Phase1_Foundation', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124173808_Phase2_ScanResults'
)
BEGIN
    ALTER TABLE [MediaAssets] ADD [MalwareNamesFound] nvarchar(1024) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124173808_Phase2_ScanResults'
)
BEGIN
    ALTER TABLE [MediaAssets] ADD [ScanVerdict] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124173808_Phase2_ScanResults'
)
BEGIN
    ALTER TABLE [MediaAssets] ADD [ScannedAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124173808_Phase2_ScanResults'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261124173808_Phase2_ScanResults', N'8.0.8');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124192511_Phase2_OutboxIdempotency'
)
BEGIN
    ALTER TABLE [OutboxMessages] ADD [IdempotencyKey] nvarchar(128) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124192511_Phase2_OutboxIdempotency'
)
BEGIN
    ALTER TABLE [OutboxMessages] ADD [SampleId] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124192511_Phase2_OutboxIdempotency'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_OutboxMessages_IdempotencyKey] ON [OutboxMessages] ([IdempotencyKey]) WHERE [IdempotencyKey] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124192511_Phase2_OutboxIdempotency'
)
BEGIN
    CREATE INDEX [IX_OutboxMessages_SampleId] ON [OutboxMessages] ([SampleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261124192511_Phase2_OutboxIdempotency'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261124192511_Phase2_OutboxIdempotency', N'8.0.8');
END;
GO

COMMIT;
GO

