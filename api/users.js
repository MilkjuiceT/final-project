import { Router } from "express";
import bcrypt from "bcryptjs";

import prisma from "../lib/prisma.js";
import { UserCreate, UserLogin } from "../lib/zod.js"
import { generateAuthToken, checkAuth, requireAuth, requireRole } from "../lib/auth.js";


const router = Router()

/*
* POST /users
* Registers a user
* Allows admin registration if admin is logged in
*/
router.post('/', checkAuth, async (req, res, next) => {
    // Validate the user input
    const data = UserCreate.parse(req.body)
    if(!data) {
        res.status(400).send({
            err: "The request body was either not present or did not contain a valid User object."
        })
    }
    // Check for the admin role
    if (data.role == "admin" && req.role != "admin") {
        res.status(403).send({
            err: "The request was not made by an authenticated User."
        })
    } else {
        // Hash the provided password
        const hash = bcrypt.hashSync(data.password, 10)
        // Create and return user info
        const user = await prisma.user.create({ 
            data:{
                name: data.name,
                email: data.email,
                passwordHash: hash,
                role: data.role
            }
        })
        res.status(201).send({ id: user.id })
    }
})

/*
* GET /users/:id
* Retrieve information about a user
* Only retrieve information if you have access to it
* (the user themselves, or an admin)
*/
router.get('/:id', requireAuth, async (req, res, next) => {
    const id = parseInt(req.params.id)

    // Validate that the requester is either this user or an admin
    if (id !== req.user && req.role !== 'admin') {
        return res.status(403).send({
            err: "The request was not made by an authenticated User satisfying the authorization criteria."
        })
    }

    const userData = await prisma.user.findUnique({ where: { id } })
    if (!userData) return next()

    // Include the list of courses this user teaches (instructor)
    // or is enrolled in (student)
    let courses = []
    if (userData.role === 'instructor') {
        courses = await prisma.course.findMany({
            where: { instructorId: id }
        })
    } else if (userData.role === 'student') {
        const enrollments = await prisma.enrollment.findMany({
            where: { userId: id },
            include: { course: true }
        })
        courses = enrollments.map(e => e.course)
    }

    res.status(200).send({
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        courses
    })
})


/*
* POST /users/login
* Verifies a user's password and username
* Generates a jwt for the user
*/
router.post('/login', async (req, res, next) => {
    // Validate the user input
    const data = UserLogin.parse(req.body)
    // Check that the user provided the expected data
    if(data) {
        // Check for existing user email
        const userData = await prisma.user.findUnique({
            where: { email: data.email }
        })
        // Validate the password
        const auth = userData && await bcrypt.compare(data.password, userData.passwordHash) 
        if (auth) {
            // Create token and respond to user
            const token = generateAuthToken(userData.id, userData.role)
            res.status(200).send({ token: token })
        } else {
            // Return 401 if user credentials are wrong or user does not exist
            res.status(401).send({
                err: "The specified credentials were invalid."
            })
        }
    } else {
        res.status(400).send({
            err: "The request body was either not present or did not contain all of the required fields."
        })
    }
})

export default router