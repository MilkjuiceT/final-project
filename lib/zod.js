import * as z from "zod"

export const UserCreate = z.object({
    name: z.string(),
    email: z.email(),
    password: z.string().min(8),
    role: z.enum(['admin', 'instructor', 'student']).default('student')
})

export const UserLogin = z.object({
    email: z.email(),
    password: z.string()
})

export const Course = z.object({
    subject: z.string(),
    number: z.string(),
    title: z.string(),
    term: z.string(),
    instructorId: z.int().positive()
})

export const CourseUpdate = Course.partial()

export const Assignment = z.object({
    courseId: z.number().int().positive(),
    title: z.string(),
    dueDate: z.string().datetime(),
    points: z.number().int().positive()
})

export const AssignmentUpdate = Assignment.partial()

export const EnrollmentUpdate = z.object({
    add: z.array(z.int().positive()).optional(),
    remove: z.array(z.int().positive()).optional()
})

export const SubmissionGrade = z.object({
    grade: z.number().min(0)
})
