import { Router } from 'express'
import multer from 'multer'
import { randomBytes } from 'crypto'
import path from 'path'

import prisma from '../lib/prisma.js'
import supabase, { SUBMISSIONS_BUCKET } from '../lib/supabase.js'
import { publishPlagiarismTask } from '../lib/rabbitmq.js'
import { SubmissionGrade } from '../lib/zod.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = Router({ mergeParams: true })

/*
 * Multer with MemoryStorage.
 * Only accepts any file type (submission files can be any format).
 */
const upload = multer({ storage: multer.memoryStorage() })

/*
 * GET /assignments/:id/submissions
 * Returns paginated submissions for an assignment.
 * Admin or course instructor only.
 */
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const assignmentId = parseInt(req.params.id)
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: { course: true }
        })
        if (!assignment) return next()

        const isAdmin = req.role === 'admin'
        const isInstructor = req.id === assignment.course.instructorId

        // Students can only see their own submissions
        const where = { assignmentId }
        if (!isAdmin && !isInstructor) {
            where.studentId = req.user.id
        } else if (req.query.studentId) {
            where.studentId = parseInt(req.query.studentId)
        }

        // Cursor pagination
        const cursor = parseInt(req.query.cursor)
        const pageSize = 10

        let submissions = await prisma.submission.findMany({
            where,
            cursor: cursor ? { id: cursor } : undefined,
            take: pageSize + 1,
            skip: cursor ? 1 : 0,
            orderBy: { createdAt: 'desc' }
        })

        const hasNextPage = submissions.length > pageSize
        submissions = hasNextPage ? submissions.slice(0, -1) : submissions

        res.status(200).send({
            submissions,
            page: {
                pageSize,
                nextCursor: hasNextPage ? submissions[submissions.length - 1].id : null
            }
        })
    } catch (err) {
        next(err)
    }
})

/*
 * POST /assignments/:id/submissions
 * Creates a new submission with a file upload.
 * Students only, and must be enrolled in the course.
 */
router.post('/', requireAuth, requireRole('student'), upload.single('file'), async (req, res, next) => {
    console.log("USER:", req.user)
    try {
        const assignmentId = parseInt(req.params.id)
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId }
        })
        if (!assignment) return next()

        // Verify student is enrolled in the course
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId: req.user,
                    courseId: assignment.courseId
                }
            }
        })
        if (!enrollment) {
            return res.status(403).send({ error: 'You are not enrolled in this course' })
        }

        if (!req.file) {
            return res.status(400).send({ error: 'A submission file is required' })
        }

        // Build unique filename
        const ext = path.extname(req.file.originalname) || '.bin'
        const filename = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from(SUBMISSIONS_BUCKET)
            .upload(filename, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            })

        if (uploadError) {
            console.error('Supabase upload error:', uploadError)
            return res.status(500).send({ error: 'Failed to store submission file' })
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(SUBMISSIONS_BUCKET)
            .getPublicUrl(filename)

        const fileUrl = urlData.publicUrl

        // Save submission record
        const submission = await prisma.submission.create({
            data: {
                assignmentId,
                studentId: req.user,
                fileUrl,
                filename
            }
        })

        // Enqueue plagiarism task
        publishPlagiarismTask(submission.id, filename, fileUrl).catch(err => {
            console.error('Failed to enqueue plagiarism task:', err.message)
        })

        res.status(201).send({ id: submission.id, fileUrl })
    } catch (err) {
        next(err)
    }
})

/*
 * PATCH /assignments/:id/submissions/:submissionId
 * Assigns a grade to a submission.
 * Admin or course instructor only.
 */
router.patch('/:submissionId', requireAuth, async (req, res, next) => {
    try {
        const assignmentId = parseInt(req.params.id)
        const submissionId = parseInt(req.params.submissionId)

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: { course: true }
        })
        if (!assignment) return next()

        if (req.role !== 'admin' && req.id !== assignment.course.instructorId) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const { grade } = SubmissionGrade.parse(req.body)
        const submission = await prisma.submission.update({
            where: { id: submissionId },
            data: { grade }
        })

        res.status(200).send(submission)
    } catch (err) {
        next(err)
    }
})

export default router
