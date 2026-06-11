import express from 'express'
import morgan from 'morgan'
import * as z from 'zod'
import {
    PrismaClientKnownRequestError,
    PrismaClientValidationError
} from '@prisma/client/runtime/client'

import api from './api/index.js'

const app = express()
const port = process.env.PORT || 8000

app.use(morgan('dev'))
app.use(express.json())

app.use('/', api)

app.use((err, req, res, next) => {
    if (err instanceof z.ZodError) {
        res.status(400).send({ err: z.prettifyError(err) })
    } else if (err instanceof PrismaClientValidationError) {
        res.status(400).send({ err: err.message })
    } else if (err instanceof PrismaClientKnownRequestError && err.code === 'P2003') {
        res.status(400).send({ err: err.message })
    } else if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
        next()
    } else if (err.message === 'Only image files are accepted') {
        res.status(400).send({ err: err.message })
    } else {
        console.error(err)
        res.status(500).send({ err: err.message })
    }
})

app.use('*splat', (req, res) => {
    res.status(404).send({
        error: `Requested resource ${req.originalUrl} does not exist`
    })
})

app.listen(port, () => {
    console.log('== Server is running on port', port)
})
