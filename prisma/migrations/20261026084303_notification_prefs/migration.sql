-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyBySms" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyByTelegram" BOOLEAN NOT NULL DEFAULT false;
