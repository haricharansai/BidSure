-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "department" TEXT,
    "employeeId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "cin" TEXT,
    "legalName" TEXT,
    "turnoverCr" DOUBLE PRECISION,
    "yearsExperience" INTEGER,
    "msme" BOOLEAN NOT NULL DEFAULT false,
    "iso" BOOLEAN NOT NULL DEFAULT false,
    "udyamNo" TEXT,
    "udyamNicCode" TEXT,
    "caTurnoverCr" DOUBLE PRECISION,
    "gstr3bTotalCr" DOUBLE PRECISION,
    "auditedPnlCr" DOUBLE PRECISION,
    "netWorthCr" DOUBLE PRECISION,
    "miiLocalContentPct" DOUBLE PRECISION,
    "isStartup" BOOLEAN NOT NULL DEFAULT false,
    "isReseller" BOOLEAN NOT NULL DEFAULT false,
    "dscTokenId" TEXT,
    "directorDins" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "product" TEXT,
    "quantity" TEXT,
    "unit" TEXT,
    "valueCr" DOUBLE PRECISION,
    "valueLabel" TEXT,
    "location" TEXT,
    "publishDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openDate" TIMESTAMP(3),
    "bidOpeningDate" TIMESTAMP(3),
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "auctionStart" TIMESTAMP(3),
    "auctionEnd" TIMESTAMP(3),
    "auctionExtensions" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "requirementsJson" TEXT NOT NULL DEFAULT '{}',
    "emdRequired" BOOLEAN NOT NULL DEFAULT false,
    "emdAmountCr" DOUBLE PRECISION,
    "bidValidityDays" INTEGER NOT NULL DEFAULT 30,
    "msePreference" BOOLEAN NOT NULL DEFAULT false,
    "miiMinLocalContentPct" DOUBLE PRECISION,
    "albThresholdPct" INTEGER NOT NULL DEFAULT 25,
    "corrigendaJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "awardedToCompanyId" TEXT,
    "awardNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequiredDoc" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "classification" TEXT NOT NULL,
    "conditionKey" TEXT,
    "allowedTypes" TEXT NOT NULL DEFAULT '[]',
    "maxSizeMb" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RequiredDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "technicalResponse" TEXT NOT NULL DEFAULT '{}',
    "financialBidCr" DOUBLE PRECISION,
    "eligibilitySnapshot" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittedDoc" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "docName" TEXT NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "sizeMb" DOUBLE PRECISION,
    "provided" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT NOT NULL DEFAULT 'MANDATORY',
    "extractedJson" TEXT NOT NULL DEFAULT '{}',
    "validTill" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "note" TEXT NOT NULL DEFAULT '',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "SubmittedDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "submittedDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionResult" (
    "id" TEXT NOT NULL,
    "documentFileId" TEXT NOT NULL,
    "submittedDocId" TEXT,
    "docType" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "normalizedJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCheck" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "submittedDocId" TEXT,
    "docName" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL DEFAULT '{}',
    "expectedJson" TEXT NOT NULL DEFAULT '{}',
    "foundJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "run" TEXT NOT NULL DEFAULT 'AUTHORITATIVE',
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockRegistryEntry" (
    "id" TEXT NOT NULL,
    "registry" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "isMock" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MockRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCr" DOUBLE PRECISION NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "submissionId" TEXT,
    "eligibility" TEXT NOT NULL,
    "technical" TEXT NOT NULL DEFAULT '{}',
    "compliancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "financialCr" DOUBLE PRECISION,
    "rank" INTEGER,
    "risk" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL,
    "reasonsJson" TEXT NOT NULL DEFAULT '[]',
    "flagsJson" TEXT NOT NULL DEFAULT '[]',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clarification" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "response" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondBy" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Clarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tenderId" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_tenderId_companyId_key" ON "Submission"("tenderId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_storageKey_key" ON "DocumentFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_submittedDocId_key" ON "DocumentFile"("submittedDocId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionResult_documentFileId_key" ON "ExtractionResult"("documentFileId");

-- CreateIndex
CREATE INDEX "VerificationCheck_submissionId_idx" ON "VerificationCheck"("submissionId");

-- CreateIndex
CREATE INDEX "MockRegistryEntry_key_idx" ON "MockRegistryEntry"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MockRegistryEntry_registry_key_key" ON "MockRegistryEntry"("registry", "key");

-- CreateIndex
CREATE INDEX "Bid_tenderId_amountCr_idx" ON "Bid"("tenderId", "amountCr");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_tenderId_companyId_key" ON "EvaluationResult"("tenderId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEntry_seq_key" ON "AuditEntry"("seq");

-- CreateIndex
CREATE INDEX "AuditEntry_tenderId_idx" ON "AuditEntry"("tenderId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredDoc" ADD CONSTRAINT "RequiredDoc_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittedDoc" ADD CONSTRAINT "SubmittedDoc_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_submittedDocId_fkey" FOREIGN KEY ("submittedDocId") REFERENCES "SubmittedDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionResult" ADD CONSTRAINT "ExtractionResult_documentFileId_fkey" FOREIGN KEY ("documentFileId") REFERENCES "DocumentFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionResult" ADD CONSTRAINT "ExtractionResult_submittedDocId_fkey" FOREIGN KEY ("submittedDocId") REFERENCES "SubmittedDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCheck" ADD CONSTRAINT "VerificationCheck_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clarification" ADD CONSTRAINT "Clarification_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clarification" ADD CONSTRAINT "Clarification_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE SET NULL ON UPDATE CASCADE;
