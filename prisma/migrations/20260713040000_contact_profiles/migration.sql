-- CRM-style enrichment overlay for derived contacts, keyed by lowercased email.
CREATE TABLE "ContactProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactProfile_userId_email_key" ON "ContactProfile"("userId", "email");
ALTER TABLE "ContactProfile" ADD CONSTRAINT "ContactProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
