import { Router } from 'express'

import prisma from '../lib/prisma.js'
import { Assignment, AssignmentUpdate } from '../lib/zod.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = Router()

/*
 * GET /assignments/:id
 * Get assignment by ID
 */
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id)

  try {
    const assignment = await prisma.assignment.findUnique({
      where: {
        id: id
      }
    })

    if (!assignment) {
      return res.status(404).json({
        error: `Requested resource /assignments/${id} does not exist`
      })
    }

    res.status(200).json(assignment)

  } catch (err) {
    console.error(err)

    res.status(500).json({
      error: 'Unable to fetch assignment'
    })
  }
})

/*
 * POST /assignments
 * Create a new assignment.
 * Admin or instructor (of the target course) only.
 */
router.post('/', requireAuth, requireRole('admin', 'instructor'), async (req, res) => {
        try {
            /*
             * Validate request body
             */
            const validation = Assignment.safeParse(req.body)

            if (!validation.success) {
                return res.status(400).json({
                    error: 'Invalid assignment object'
                })
            }

            const assignmentData = validation.data

            /*
             * Check that course exists
             */
            const course = await prisma.course.findUnique({
                where: {
                    id: assignmentData.courseId
                }
            })

            if (!course) {
                return res.status(400).json({
                    error: 'Course does not exist'
                })
            }

            /*
             * Authorization check
             * Admin can always create
             * Instructor must own the course
             */
            if (
                req.role === 'instructor' &&
                req.user !== course.instructorId
            ) {
                return res.status(403).json({
                    error: 'Forbidden'
                })
            }

            /*
             * Create assignment
             */
            const newAssignment = await prisma.assignment.create({
                data: {
                    courseId: assignmentData.courseId,
                    title: assignmentData.title,
                    dueDate: new Date(assignmentData.dueDate),
                    points: assignmentData.points
                }
            })

            /*
             * Success
             */
            res.status(201).json({
                id: newAssignment.id
            })

        } catch (err) {
            console.error(err)

            res.status(500).json({
                error: 'Internal server error'
            })
        }
    }
)

/*
 * PATCH /assignments/:id
 * Update assignment by ID.
 * Admin or instructor (who owns the course) only.
 */
router.patch(
    '/:id',
    requireAuth,
    requireRole('admin', 'instructor'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id)

            /*
             * Validate assignment ID
             */
            if (isNaN(id)) {
                return res.status(404).json({
                    error: 'Assignment not found'
                })
            }

            /*
             * Validate request body
             * Partial updates allowed
             */
            const validation = Assignment.partial().safeParse(req.body)

            if (!validation.success) {
                return res.status(400).json({
                    error: 'Invalid assignment update object'
                })
            }

            const updateData = validation.data

            /*
             * Reject empty body
             */
            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    error: 'No valid assignment fields provided'
                })
            }

            /*
             * Find assignment
             */
            const assignment = await prisma.assignment.findUnique({
                where: { id }
            })

            if (!assignment) {
                return res.status(404).json({
                    error: 'Assignment not found'
                })
            }

            /*
             * Get course for authorization
             */
            const course = await prisma.course.findUnique({
                where: {
                    id: assignment.courseId
                }
            })

            /*
             * Authorization check
             * Admin can always update
             * Instructor must own the course
             */
            if (
                req.role === 'instructor' &&
                req.user !== course.instructorId
            ) {
                return res.status(403).json({
                    error: 'Forbidden'
                })
            }

            /*
             * Convert dueDate if provided
             */
            if (updateData.dueDate) {
                updateData.dueDate = new Date(updateData.dueDate)
            }

            /*
             * Update assignment
             */
            await prisma.assignment.update({
                where: { id },
                data: updateData
            })

            /*
             * Success
             */
            res.status(200).send()

        } catch (err) {
            console.error(err)

            res.status(500).json({
                error: 'Internal server error'
            })
        }
    }
)

/*
 * DELETE /assignments/:id
 * Delete assignment by ID.
 * Admin or instructor (who owns the course) only.
 */
router.delete(
    '/:id',
    requireAuth,
    requireRole('admin', 'instructor'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id)

            /*
             * Validate ID
             */
            if (isNaN(id)) {
                return res.status(404).json({
                    error: 'Assignment not found'
                })
            }

            /*
             * Find assignment
             */
            const assignment = await prisma.assignment.findUnique({
                where: { id }
            })

            if (!assignment) {
                return res.status(404).json({
                    error: 'Assignment not found'
                })
            }

            /*
             * Get course for authorization
             */
            const course = await prisma.course.findUnique({
                where: {
                    id: assignment.courseId
                }
            })

            /*
             * Authorization check
             * Admin can always delete
             * Instructor must own the course
             */
            if (
                req.role === 'instructor' &&
                req.user !== course.instructorId
            ) {
                return res.status(403).json({
                    error: 'Forbidden'
                })
            }

            /*
             * Delete assignment
             */
            await prisma.assignment.delete({
                where: { id }
            })

            /*
             * Success
             */
            res.status(204).send()

        } catch (err) {
            console.error(err)

            res.status(500).json({
                error: 'Internal server error'
            })
        }
    }
)

export default router