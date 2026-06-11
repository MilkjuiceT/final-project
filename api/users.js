import { Router } from "express";
import bcrypt from "bcryptjs";

import prisma from "../lib/prisma.js";
import { UserCreate, UserLogin } from "../lib/zod.js"
import { generateAuthToken, checkAuth } from "../lib/auth.js";


const router = Router()

/*
* POST /users
* Registers a user
* Allows admin registration if admin is logged in
*/
router.get('/', checkAuth, async (req, res, next) => {
    // Validate the user input
    const data = UserCreate.parse(req.body)
    if(!data) {
        res.status(400).setDefaultEncoding({
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
        const auth = userData && await bcrypt.compare(data.password, userData.password) 
        if (auth) {
            // Create token and respond to user
            const token = generateAuthToken(userData.id, userData.admin)
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