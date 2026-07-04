/**
 * Session Authentication Middleware
 * Protects dashboard routes — checks express-session for an authenticated user.
 * Separate from the existing JWT middleware (used by API routes).
 */

/**
 * Require a valid session user.
 * Redirects to /login if not authenticated.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function isAuthenticated(req, res, next) {
    // 1. API Key Auth (for Postman/external calls)
    const apiKey = req.headers['x-api-key'];
    if (apiKey && process.env.ADMIN_API_KEY && apiKey === process.env.ADMIN_API_KEY) {
        req.sessionUser = { role: 'admin', name: 'API User' };
        return next();
    }

    // 2. Session Auth (for browser dashboard)
    if (req.session && req.session.user) {
        // Attach user to req for convenience in controllers
        req.sessionUser = req.session.user;
        return next();
    }
    
    // 3. Unauthorized response
    if (req.path.startsWith('/api')) {
        return res.status(401).json({ success: false, message: "Unauthorized. Missing or invalid session / x-api-key header." });
    }

    // Store the intended URL for redirect after login (for web views)
    req.session.returnTo = req.originalUrl;
    res.redirect("/login");
}

/**
 * Redirect already-authenticated users away from login page.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function redirectIfAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return res.redirect("/dashboard");
    }
    next();
}
