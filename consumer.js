import dotenv from 'dotenv'
import amqplib from 'amqplib'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'
const QUEUE_NAME = 'plagiarism'
const PLAGIARISM_API = 'https://web.engr.oregonstate.edu/~hessro/api/plagiarism.php'
const SUBMISSIONS_BUCKET = process.env.SUPABASE_SUBMISSIONS_BUCKET || 'submissions'

const adapter = new PrismaPg({ connectionString: process.env.POSTGRES_URL })
const prisma = new PrismaClient({ adapter })

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

/*
 * Download a file from Supabase Storage into a Buffer.
 * Uses the public URL 
 */
async function downloadFromSupabase(fileUrl) {
    const response = await fetch(fileUrl)
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`)
    }
    return Buffer.from(await response.arrayBuffer())
}

/*
 * Send the submission file to the plagiarism API and return the score.
 */
async function getPlagiarismScore(fileBuffer, filename) {
    const form = new FormData()
    form.append('submission', fileBuffer, { filename })

    const response = await fetch(PLAGIARISM_API, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
    })

    if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(`Plagiarism API error: ${err.err || response.statusText}`)
    }

    const result = await response.json()
    return result.score
}

/*
 * Process a single plagiarism task message.
 */
async function processMessage(msg, channel) {
    let payload
    try {
        payload = JSON.parse(msg.content.toString())
    } catch {
        console.error('Invalid message format — discarding')
        channel.nack(msg, false, false)
        return
    }

    const { submissionId, filename, fileUrl } = payload
    console.log(`Processing submission ${submissionId}...`)

    try {
        const fileBuffer = await downloadFromSupabase(fileUrl)

        const plagiarismScore = await getPlagiarismScore(fileBuffer, filename)
        console.log(`Submission ${submissionId} score: ${plagiarismScore}`)

        await prisma.submission.update({
            where: { id: submissionId },
            data: { plagiarismScore }
        })

        channel.ack(msg)
        console.log(`Submission ${submissionId} complete`)
    } catch (err) {
        console.error(`Error processing submission ${submissionId}:`, err.message)
        channel.nack(msg, false, true)
    }
}

/*
 * Main consumer loop
 */
async function startConsumer() {
    console.log('Connecting to RabbitMQ...')
    const connection = await amqplib.connect(RABBITMQ_URL)
    const channel = await connection.createChannel()

    await channel.assertQueue(QUEUE_NAME, { durable: true })
    channel.prefetch(1)

    console.log(`Waiting for messages on queue "${QUEUE_NAME}"`)
    channel.consume(QUEUE_NAME, (msg) => {
        if (msg) processMessage(msg, channel)
    })

    process.on('SIGINT', async () => {
        console.log('Shutting down consumer...')
        await channel.close()
        await connection.close()
        await prisma.$disconnect()
        process.exit(0)
    })
}

startConsumer().catch(err => {
    console.error('Consumer failed to start:', err)
    process.exit(1)
})
