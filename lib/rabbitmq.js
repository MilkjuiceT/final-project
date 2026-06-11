import amqplib from 'amqplib'

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'
export const QUEUE_NAME = 'plagiarism'

/*
 * Publish a plagiarism task to RabbitMQ.
 */
export async function publishPlagiarismTask(submissionId, filename, fileUrl) {
    let connection
    try {
        connection = await amqplib.connect(RABBITMQ_URL)
        const channel = await connection.createChannel()
        await channel.assertQueue(QUEUE_NAME, { durable: true })
        const payload = JSON.stringify({ submissionId, filename, fileUrl })
        channel.sendToQueue(QUEUE_NAME, Buffer.from(payload), { persistent: true })
        await channel.close()
    } finally {
        if (connection) {
            await connection.close()
        }
    }
}
