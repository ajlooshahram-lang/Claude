-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('NEC4_OPTION_A', 'NEC4_OPTION_B', 'NEC4_OPTION_C', 'NEC4_OPTION_D', 'FIDIC_RED', 'FIDIC_YELLOW', 'FIDIC_SILVER', 'OTHER');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'TENDERED', 'AWARDED', 'ACTIVE', 'SUBSTANTIALLY_COMPLETE', 'DEFECTS_LIABILITY', 'FINAL_ACCOUNT', 'CLOSED', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('PROPOSED', 'ASSESSED', 'APPROVED', 'REJECTED', 'IMPLEMENTED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ASSESSED', 'AGREED', 'PAID', 'DISPUTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CERTIFIED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "RouteSectionStatus" AS ENUM ('PLANNED', 'SURVEYED', 'PERMITTED', 'TRENCHED', 'DUCTED', 'CABLED', 'SPLICED', 'TESTED', 'COMMISSIONED', 'LIVE');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'API', 'CENTRAL_BANK');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "programmeId" TEXT;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "programmeId" TEXT;

-- AlterTable
ALTER TABLE "RegisterRow" ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "programmeId" TEXT;

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalBudget" DECIMAL(20,2) NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL DEFAULT 'OTHER',
    "contractor" TEXT,
    "contractValue" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "retentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "maxRetentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "defectsLiabilityMonths" INTEGER NOT NULL DEFAULT 12,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "cumulativeCertified" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "cumulativePaid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "retentionHeld" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "workType" TEXT,
    "location" JSONB NOT NULL DEFAULT '{}',
    "routeKmStart" DOUBLE PRECISION,
    "routeKmEnd" DOUBLE PRECISION,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedTo" TEXT,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedQuantity" DOUBLE PRECISION,
    "actualQuantity" DOUBLE PRECISION,
    "unit" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVariation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timeImpactDays" INTEGER,
    "assessedAmount" DECIMAL(20,2),
    "assessedTimeDays" INTEGER,
    "status" "VariationStatus" NOT NULL DEFAULT 'PROPOSED',
    "submittedDate" TIMESTAMP(3),
    "assessedDate" TIMESTAMP(3),
    "approvedDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "implementedDate" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContractVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "claimType" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contractClause" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "assessedAmount" DECIMAL(20,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timeClaimedDays" INTEGER,
    "timeAwardedDays" INTEGER,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedDate" TIMESTAMP(3),
    "responseDeadline" TIMESTAMP(3),
    "assessedDate" TIMESTAMP(3),
    "agreedDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContractClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "certNumber" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "workDoneThisPeriod" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "materialsOnSite" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "variationsIncluded" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "retentionDeducted" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "previousCertified" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedDate" TIMESTAMP(3),
    "certifiedDate" TIMESTAMP(3),
    "certifiedBy" TEXT,
    "approvedDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidDate" TIMESTAMP(3),
    "paymentRef" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programmeId" TEXT,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "projectId" TEXT,
    "packageId" TEXT,
    "period" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "plannedProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "budgetAtCompletion" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "plannedValue" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "earnedValue" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "spiValue" DOUBLE PRECISION,
    "cpiValue" DOUBLE PRECISION,
    "eacValue" DECIMAL(20,2),
    "etcValue" DECIMAL(20,2),
    "narrative" TEXT,
    "keyIssues" JSONB NOT NULL DEFAULT '[]',
    "keyRisks" JSONB NOT NULL DEFAULT '[]',
    "decisionsRequired" JSONB NOT NULL DEFAULT '[]',
    "forecastCompletion" TIMESTAMP(3),
    "forecastCost" DECIMAL(20,2),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "name" TEXT NOT NULL,
    "kmStart" DOUBLE PRECISION NOT NULL,
    "kmEnd" DOUBLE PRECISION NOT NULL,
    "coordinates" JSONB NOT NULL DEFAULT '{}',
    "cableType" TEXT,
    "fibreCount" INTEGER,
    "ductType" TEXT,
    "status" "RouteSectionStatus" NOT NULL DEFAULT 'PLANNED',
    "surveyedDate" TIMESTAMP(3),
    "installedDate" TIMESTAMP(3),
    "splicedDate" TIMESTAMP(3),
    "testedDate" TIMESTAMP(3),
    "commissionedDate" TIMESTAMP(3),
    "otdrResults" JSONB,
    "insertionLoss" DOUBLE PRECISION,
    "reflectance" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RouteSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncQueue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB NOT NULL,
    "baseVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "conflictDetected" BOOLEAN NOT NULL DEFAULT false,
    "conflictResolution" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "SyncQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Programme_tenantId_idx" ON "Programme"("tenantId");

-- CreateIndex
CREATE INDEX "Programme_tenantId_deletedAt_idx" ON "Programme"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Package_tenantId_idx" ON "Package"("tenantId");

-- CreateIndex
CREATE INDEX "Package_programmeId_idx" ON "Package"("programmeId");

-- CreateIndex
CREATE INDEX "Package_projectId_idx" ON "Package"("projectId");

-- CreateIndex
CREATE INDEX "Package_tenantId_status_idx" ON "Package"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_idx" ON "WorkOrder"("tenantId");

-- CreateIndex
CREATE INDEX "WorkOrder_packageId_idx" ON "WorkOrder"("packageId");

-- CreateIndex
CREATE INDEX "WorkOrder_packageId_status_idx" ON "WorkOrder"("packageId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedTo_idx" ON "WorkOrder"("assignedTo");

-- CreateIndex
CREATE INDEX "ContractVariation_tenantId_idx" ON "ContractVariation"("tenantId");

-- CreateIndex
CREATE INDEX "ContractVariation_packageId_idx" ON "ContractVariation"("packageId");

-- CreateIndex
CREATE INDEX "ContractVariation_packageId_status_idx" ON "ContractVariation"("packageId", "status");

-- CreateIndex
CREATE INDEX "ContractClaim_tenantId_idx" ON "ContractClaim"("tenantId");

-- CreateIndex
CREATE INDEX "ContractClaim_packageId_idx" ON "ContractClaim"("packageId");

-- CreateIndex
CREATE INDEX "ContractClaim_packageId_status_idx" ON "ContractClaim"("packageId", "status");

-- CreateIndex
CREATE INDEX "PaymentCertificate_tenantId_idx" ON "PaymentCertificate"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentCertificate_packageId_idx" ON "PaymentCertificate"("packageId");

-- CreateIndex
CREATE INDEX "PaymentCertificate_packageId_status_idx" ON "PaymentCertificate"("packageId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCertificate_packageId_certNumber_key" ON "PaymentCertificate"("packageId", "certNumber");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_idx" ON "ExchangeRate"("tenantId");

-- CreateIndex
CREATE INDEX "ExchangeRate_fromCurrency_toCurrency_effectiveDate_idx" ON "ExchangeRate"("fromCurrency", "toCurrency", "effectiveDate");

-- CreateIndex
CREATE INDEX "ExchangeRate_programmeId_idx" ON "ExchangeRate"("programmeId");

-- CreateIndex
CREATE INDEX "ProgressReport_tenantId_idx" ON "ProgressReport"("tenantId");

-- CreateIndex
CREATE INDEX "ProgressReport_programmeId_period_idx" ON "ProgressReport"("programmeId", "period");

-- CreateIndex
CREATE INDEX "ProgressReport_projectId_period_idx" ON "ProgressReport"("projectId", "period");

-- CreateIndex
CREATE INDEX "RouteSection_tenantId_idx" ON "RouteSection"("tenantId");

-- CreateIndex
CREATE INDEX "RouteSection_packageId_idx" ON "RouteSection"("packageId");

-- CreateIndex
CREATE INDEX "RouteSection_workOrderId_idx" ON "RouteSection"("workOrderId");

-- CreateIndex
CREATE INDEX "RouteSection_packageId_status_idx" ON "RouteSection"("packageId", "status");

-- CreateIndex
CREATE INDEX "RouteSection_kmStart_kmEnd_idx" ON "RouteSection"("kmStart", "kmEnd");

-- CreateIndex
CREATE INDEX "SyncQueue_tenantId_idx" ON "SyncQueue"("tenantId");

-- CreateIndex
CREATE INDEX "SyncQueue_userId_syncedAt_idx" ON "SyncQueue"("userId", "syncedAt");

-- CreateIndex
CREATE INDEX "SyncQueue_deviceId_createdAt_idx" ON "SyncQueue"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncQueue_syncedAt_idx" ON "SyncQueue"("syncedAt");

-- CreateIndex
CREATE INDEX "AuditLog_programmeId_createdAt_idx" ON "AuditLog"("programmeId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_packageId_idx" ON "Case"("packageId");

-- CreateIndex
CREATE INDEX "Case_workOrderId_idx" ON "Case"("workOrderId");

-- CreateIndex
CREATE INDEX "Project_programmeId_idx" ON "Project"("programmeId");

-- CreateIndex
CREATE INDEX "RegisterRow_programmeId_idx" ON "RegisterRow"("programmeId");

-- CreateIndex
CREATE INDEX "RegisterRow_packageId_idx" ON "RegisterRow"("packageId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisterRow" ADD CONSTRAINT "RegisterRow_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisterRow" ADD CONSTRAINT "RegisterRow_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVariation" ADD CONSTRAINT "ContractVariation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVariation" ADD CONSTRAINT "ContractVariation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClaim" ADD CONSTRAINT "ContractClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClaim" ADD CONSTRAINT "ContractClaim_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCertificate" ADD CONSTRAINT "PaymentCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCertificate" ADD CONSTRAINT "PaymentCertificate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSection" ADD CONSTRAINT "RouteSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSection" ADD CONSTRAINT "RouteSection_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSection" ADD CONSTRAINT "RouteSection_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncQueue" ADD CONSTRAINT "SyncQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
