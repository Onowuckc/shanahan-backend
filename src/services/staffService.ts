import prisma from '../prisma';

/**
 * Generates a unique Staff ID.
 * Pattern: SU/STF/{YEAR_SHORT}/{SEQUENTIAL_NUMBER}
 * Example: SU/STF/26/1001
 */
export async function generateStaffId(year: number): Promise<string> {
  const yearCode = String(year).slice(-2);
  const prefix = `SU/STF/${yearCode}/`;

  const count = await prisma.staffProfile.count({
    where: { staffId: { startsWith: prefix } }
  });

  return `${prefix}${1001 + count}`;
}

/**
 * Generates a batch of unique sequential staff IDs.
 */
export async function generateStaffIdsBatch(year: number, size: number): Promise<string[]> {
  const yearCode = String(year).slice(-2);
  const prefix = `SU/STF/${yearCode}/`;

  const currentCount = await prisma.staffProfile.count({
    where: { staffId: { startsWith: prefix } }
  });

  return Array.from({ length: size }, (_, i) => `${prefix}${1001 + currentCount + i}`);
}
