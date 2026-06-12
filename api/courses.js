import { Router } from 'express'
import { stringify } from 'csv-stringify/sync'

import prisma from '../lib/prisma.js'
import { Course, CourseUpdate, EnrollmentUpdate } from '../lib/zod.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = Router()

/*
 * GET /courses
 * Returns paginated list of all courses.
 * Supports optional query filters: subject, number, term.
 */
router.get('/', async (req, res) => {
    const cursor = parseInt(req.query.cursor)
    const pageSize = 10
    const where = {}

    if (req.query.subject) where.subject = req.query.subject
    if (req.query.number)  where.number  = req.query.number
    if (req.query.term)    where.term    = req.query.term

    let courses = await prisma.course.findMany({
        where,
        cursor: cursor ? { id: cursor } : undefined,
        take: pageSize + 1,
        skip: cursor ? 1 : 0,
        orderBy: { id: 'asc' },
        include: {
            _count: { select: { enrollments: true, assignments: true } }
        }
    })

    const hasNextPage = courses.length > pageSize
    courses = hasNextPage ? courses.slice(0, -1) : courses

    res.status(200).send({
        courses: courses.map(c => ({
            id: c.id,
            subject: c.subject,
            number: c.number,
            title: c.title,
            term: c.term,
            instructorId: c.instructorId,
            studentCount: c._count.enrollments,
            assignmentCount: c._count.assignments
        })),
        page: {
            pageSize,
            nextCursor: hasNextPage ? courses[courses.length - 1].id : null
        }
    })
})

/*
 * GET /courses/:id
 */
router.get('/:id', async (req, res, next) => {
    const id = parseInt(req.params.id)
    const course = await prisma.course.findUnique({
        where: { id },
        include: {
            _count: { select: { enrollments: true, assignments: true } }
        }
    })
    if (!course) return next()

    res.status(200).send({
        id: course.id,
        subject: course.subject,
        number: course.number,
        title: course.title,
        term: course.term,
        instructorId: course.instructorId,
        studentCount: course._count.enrollments,
        assignmentCount: course._count.assignments
    })
})

/*
 * POST /courses
 * Creates a new course. Admin only.
 */
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const data = Course.parse(req.body)
        const course = await prisma.course.create({ data })
        res.status(201).send({ id: course.id })
    } catch (err) {
        next(err)
    }
})

/*
 * PATCH /courses/:id
 * Updates a course. Admin only.
 */
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)
        const data = CourseUpdate.parse(req.body)
        const course = await prisma.course.update({ where: { id }, data })
        res.status(200).send(course)
    } catch (err) {
        next(err)
    }
})

/*
 * DELETE /courses/:id
 * Deletes a course. Admin only.
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)
        await prisma.course.delete({ where: { id } })
        res.status(204).send()
    } catch (err) {
        next(err)
    }
})

/*
 * GET /courses/:id/students
 */
router.get('/:id/students', requireAuth, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)
        const course = await prisma.course.findUnique({ where: { id } })
        if (!course) return next()

        // Only admin or the course instructor can see the roster
        if (req.role !== 'admin' && req.id !== course.instructorId) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const enrollments = await prisma.enrollment.findMany({
            where: { courseId: id },
            include: { user: { select: { id: true, name: true, email: true } } }
        })

        res.status(200).send({
            students: enrollments.map(e => e.user)
        })
    } catch (err) {
        next(err)
    }
})

/*
 * POST /courses/:id/students
 */
router.post('/:id/students', requireAuth, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)
        const course = await prisma.course.findUnique({ where: { id } })
        if (!course) return next()

        if (req.role !== 'admin' && req.id !== course.instructorId) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const { add = [], remove = [] } = EnrollmentUpdate.parse(req.body)

        // Add enrollments
        if (add.length > 0) {
            await prisma.enrollment.createMany({
                data: add.map(userId => ({ userId, courseId: id })),
                skipDuplicates: true
            })
        }

        // Remove enrollments
        if (remove.length > 0) {
            await prisma.enrollment.deleteMany({
                where: {
                    courseId: id,
                    userId: { in: remove }
                }
            })
        }

        res.status(200).send()
    } catch (err) {
        next(err)
    }
})

/*
 * GET /courses/:id/roster
 * Downloads a CSV roster of enrolled students.
 * Admin or the course instructor only.
 */
router.get('/:id/roster', requireAuth, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)
        const course = await prisma.course.findUnique({ where: { id } })
        if (!course) return next()

        if (req.role !== 'admin' && req.id !== course.instructorId) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const enrollments = await prisma.enrollment.findMany({
            where: { courseId: id },
            include: { user: { select: { id: true, name: true, email: true } } }
        })

        const csv = stringify(
            enrollments.map(e => [e.user.id, e.user.name, e.user.email])
        )

        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename="course-${id}-roster.csv"`)
        res.status(200).send(csv)
    } catch (err) {
        next(err)
    }
})

/*
 * GET /courses/:id/assignments
 * Returns all assignments for a course.
 */
router.get('/:id/assignments', async (req, res, next) => {
    const id = parseInt(req.params.id)
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) return next()

    const assignments = await prisma.assignment.findMany({
        where: { courseId: id },
        orderBy: { dueDate: 'asc' }
    })

    res.status(200).send({ assignments })
})

export default router
