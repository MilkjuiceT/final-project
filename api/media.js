import { Router } from 'express'

import prisma from '../lib/prisma.js'
import supabase, { SUBMISSIONS_BUCKET } from '../lib/supabase.js'
import { requireAuth } from '../lib/auth.js'

const router = Router()

/*
 * GET /media/submissions/:filename
 * Downloads a Submission's file.
 * Admin, the owning instructor, or the submitting student only.
 */
router.get('/:filename', requireAuth, async (req, res, next) => {
    try {
        const { filename } = req.params

        const submission = await prisma.submission.findFirst({
            where: { filename },
            include: { assignment: { include: { course: true } } }
        })
        if (!submission) return next()

        const isAdmin = req.role === 'admin'
        const isInstructor = req.user === submission.assignment.course.instructorId
        const isOwner = req.user === submission.studentId

        if (!isAdmin && !isInstructor && !isOwner) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const { data, error } = await supabase.storage
            .from(SUBMISSIONS_BUCKET)
            .download(filename)

        if (error || !data) {
            return next()
        }

        const buffer = Buffer.from(await data.arrayBuffer())
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        res.status(200).send(buffer)
    } catch (err) {
        next(err)
    }
})

export default router