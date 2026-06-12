import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config({ path: ".env.local" })

const secret = process.env.JWT_SECRET

// Function to create an auth token
export function generateAuthToken(id, role) {
    const payload = { sub: id, role: role }
    return jwt.sign(payload, secret, { expiresIn: "24h" })
}

// Function to check authentication
export function requireAuth(req, res, next) {
    // Get the auth token
    const authHeader = req.get("Authorization") || ""
    const authHeaderParts = authHeader.split(" ")
    const token = authHeaderParts[0] === "Bearer"
        ? authHeaderParts[1] : null

    // Verify the token
    jwt.verify(token, secret, (err, payload) => {
        if (err) {
            // Send error if the verification fails
            res.status(401).send({
                err: "Invalid auth token"
            })
        } else {
            // Set the active user fields
            req.user = payload.sub
            req.role = payload.role
            next()
        }
    })
}

// Checks that the user's role matches one of the allowed roles.
// Usage: requireRole('admin'), requireRole('admin', 'instructor'), etc.
export function requireRole(...allowedRoles) {
    return function (req, res, next) {
        if (allowedRoles.includes(req.role)) {
            next()
        } else {
            // Send error if the role does not match
            res.status(403).send({
                err: "Current role cannot perform this action"
            })
        }
    }
}

export const checkAuth = requireAuth