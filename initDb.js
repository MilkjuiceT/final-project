import bcrypt from 'bcrypt'
import prisma from './lib/prisma.js'

import users from './data/users.json' with { type: 'json' }
import courses from './data/courses.json' with { type: 'json' }
import assignments from './data/assignments.json' with { type: 'json' }

// Hash passwords before inserting
const hashedUsers = await Promise.all(
    users.map(async (u) => ({
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        role: u.role
    }))
)

const userResult = await prisma.user.createMany({ data: hashedUsers })
console.log(`Created ${userResult.count} users`)

const courseResult = await prisma.course.createMany({ data: courses })
console.log(`Created ${courseResult.count} courses`)

const assignmentResult = await prisma.assignment.createMany({ data: assignments })
console.log(`Created ${assignmentResult.count} assignments`)

// Enroll students 4, 5, 6 in course 1 and 2
const enrollments = [
    { userId: 4, courseId: 1 },
    { userId: 5, courseId: 1 },
    { userId: 6, courseId: 1 },
    { userId: 4, courseId: 2 },
    { userId: 5, courseId: 2 }
]
const enrollmentResult = await prisma.enrollment.createMany({ data: enrollments })
console.log(`Created ${enrollmentResult.count} enrollments`)

await prisma.$disconnect()