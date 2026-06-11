import { Router } from 'express'

import coursesRouter from './courses.js'
import assignmentsRouter from './assignments.js'
import usersRouter from './users.js'
import submissionsRouter from './submissions.js'

const router = Router()

router.use('/courses', coursesRouter)
router.use('/assignments', assignmentsRouter)
router.use('/users', usersRouter)

router.use('/assignments/:id/submissions', submissionsRouter)

export default router
