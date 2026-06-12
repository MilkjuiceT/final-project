import { Router } from 'express'

import prisma from '../lib/prisma.js'
import { SubmissionGrade } from '../lib/zod.js'
import { requireAuth } from '../lib/auth.js'

const router = Router()

/*
 * PATCH /submissions/:id
 * Assigns a grade to a submission.
 * Admin or course instructor only.
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id)

        const submission = await prisma.submission.findUnique({
            where: { id },
            include: { assignment: { include: { course: true } } }
        })
        if (!submission) return next()

        if (req.role !== 'admin' && req.user !== submission.assignment.course.instructorId) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const { grade } = SubmissionGrade.parse(req.body)
        const updated = await prisma.submission.update({
            where: { id },
            data: { grade }
        })

        res.status(200).send(updated)
    } catch (err) {
        next(err)
    }
})

export default router