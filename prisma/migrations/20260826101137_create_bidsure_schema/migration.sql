/*
  Warnings:

  - You are about to drop the `Test` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GST_CERTIFICATE', 'PAN_CARD', 'UDYAM_CERTIFICATE', 'INCOME_TAX_RETURN', 'COMPANY_REGISTRATION', 'STARTUP_CERTIFICATE', 'NSIC_CERTIFICATE', 'OTHER');

-- DropTable
DROP TABLE "Test";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bidder" (
    "id" SERIAL NOT NULL,
    "companyName" TEXT NOT NULL,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "udyamNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bidder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "bidderId" INTEGER NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bidderId" INTEGER NOT NULL,
    "bidId" INTEGER NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRequirement" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" SERIAL NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "extractedValue" TEXT,
    "expectedValue" TEXT,
    "remarks" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "bidId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "requirementId" INTEGER NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Bidder_gstNumber_key" ON "Bidder"("gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Bidder_panNumber_key" ON "Bidder"("panNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Bidder_udyamNumber_key" ON "Bidder"("udyamNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_tenderId_key" ON "Bid"("tenderId");

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ComplianceRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
