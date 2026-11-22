-- DropIndex
DROP INDEX "Product_isActive_idx";

-- CreateIndex
CREATE INDEX "Product_isActive_createdAt_id_idx" ON "Product"("isActive", "createdAt" DESC, "id" DESC);
