import { db } from './index.ts';
import {
  academicYears,
  classes,
  gradeScales,
  gradeSubjects,
  schoolSettings,
  subjects,
  terms,
} from './schema.ts';
import { count, eq } from 'drizzle-orm';

let initializedPromise: Promise<void> | null = null;

/**
 * Ensures baseline system configuration exists in PostgreSQL:
 * - Exactly 12 configurable placeholder subjects (Subject 01 .. Subject 12)
 * - Default grade scales (A, B, C, S, W)
 * - Default school settings
 * - Initial Academic Year (2026) and Terms 1-3
 * - Grade 6-13 default classes (Section A) so Admin can begin right away
 * Does NOT create any fake student or teacher data.
 */
export async function ensureSystemInitialized(): Promise<void> {
  if (initializedPromise) {
    return initializedPromise;
  }

  initializedPromise = (async () => {
    try {
      // 1. Exactly 12 configurable subjects (Subject 01 to Subject 12)
      const [{ value: subjectCount }] = await db
        .select({ value: count() })
        .from(subjects);

      let subjectRows = await db.select().from(subjects);
      if (subjectCount === 0) {
        const initialSubjects = Array.from({ length: 12 }, (_, idx) => {
          const num = String(idx + 1).padStart(2, '0');
          return {
            code: `SUB-${num}`,
            name: `Subject ${num}`,
            description: `Configurable curriculum subject ${num}`,
            isActive: true,
            displayOrder: idx + 1,
          };
        });
        subjectRows = await db
          .insert(subjects)
          .values(initialSubjects)
          .returning();
      }

      // 2. Default Grade Scales
      const [{ value: scaleCount }] = await db
        .select({ value: count() })
        .from(gradeScales);
      if (scaleCount === 0) {
        await db.insert(gradeScales).values([
          {
            gradeLetter: 'A',
            minMarks: 75,
            maxMarks: 100,
            description: 'Distinction',
            gradePoint: 4.0,
            displayOrder: 1,
          },
          {
            gradeLetter: 'B',
            minMarks: 65,
            maxMarks: 74,
            description: 'Very Good',
            gradePoint: 3.0,
            displayOrder: 2,
          },
          {
            gradeLetter: 'C',
            minMarks: 50,
            maxMarks: 64,
            description: 'Credit',
            gradePoint: 2.0,
            displayOrder: 3,
          },
          {
            gradeLetter: 'S',
            minMarks: 35,
            maxMarks: 49,
            description: 'Ordinary Pass',
            gradePoint: 1.0,
            displayOrder: 4,
          },
          {
            gradeLetter: 'W',
            minMarks: 0,
            maxMarks: 34,
            description: 'Needs Support',
            gradePoint: 0.0,
            displayOrder: 5,
          },
        ]);
      }

      // 3. Default School Settings
      const [{ value: settingsCount }] = await db
        .select({ value: count() })
        .from(schoolSettings);
      if (settingsCount === 0) {
        await db.insert(schoolSettings).values({
          schoolName: 'Ke/De Nakkavita Kanishta Vidyalaya',
          schoolAddress: 'Grades 6–13 Academic Campus',
          schoolEmail: 'office@nakkavita-kv.edu',
          schoolPhone: '+94 35 220 0000',
          principalName: 'Office of the Principal',
          academicMotto: 'Education • Discipline • Knowledge',
        });
      }

      // 4. Default Academic Year (2026) & 3 Terms
      const [{ value: yearCount }] = await db
        .select({ value: count() })
        .from(academicYears);

      let currentYearId: number | null = null;
      if (yearCount === 0) {
        const [yr] = await db
          .insert(academicYears)
          .values({
            name: '2026',
            startDate: '2026-01-05',
            endDate: '2026-12-18',
            isCurrent: true,
          })
          .returning();
        currentYearId = yr.id;

        await db.insert(terms).values([
          {
            academicYearId: yr.id,
            name: 'Term 1',
            termNumber: 1,
            startDate: '2026-01-05',
            endDate: '2026-04-10',
            isActive: false,
          },
          {
            academicYearId: yr.id,
            name: 'Term 2',
            termNumber: 2,
            startDate: '2026-04-27',
            endDate: '2026-08-14',
            isActive: false,
          },
          {
            academicYearId: yr.id,
            name: 'Term 3',
            termNumber: 3,
            startDate: '2026-09-01',
            endDate: '2026-12-18',
            isActive: true,
          },
        ]);

        // Initialize Grades 6-13 default Section A classes
        const gradeClasses = [];
        for (let grade = 6; grade <= 13; grade++) {
          gradeClasses.push({
            academicYearId: yr.id,
            grade,
            section: 'A',
            name: `Grade ${grade} - A`,
            capacity: 40,
          });
        }
        await db.insert(classes).values(gradeClasses);

        // Link first 6 subjects as compulsory and remaining 6 as optional for Grades 6-11,
        // and configurable optional for Grades 12-13 (Admin can modify freely)
        if (subjectRows.length > 0) {
          const gsRows = [];
          for (let grade = 6; grade <= 13; grade++) {
            for (const subj of subjectRows) {
              gsRows.push({
                grade,
                subjectId: subj.id,
                academicYearId: yr.id,
                isCompulsory: grade <= 11 && subj.displayOrder <= 6,
              });
            }
          }
          await db.insert(gradeSubjects).values(gsRows);
        }
      } else {
        const [yr] = await db
          .select()
          .from(academicYears)
          .where(eq(academicYears.isCurrent, true));
        currentYearId = yr?.id ?? null;
      }
      void currentYearId;
    } catch (error) {
      initializedPromise = null;
      console.error('System initialization error:', error);
      throw new Error('Failed to initialize baseline school configuration.', {
        cause: error,
      });
    }
  })();

  return initializedPromise;
}
