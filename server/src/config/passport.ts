import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AzureAdOAuth2Strategy } from 'passport-azure-ad-oauth2';
import { pool } from '../db/pool.js';
import jwt from 'jsonwebtoken';

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: number, done) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, username, avatar, oauth_provider, onboarding_completed FROM users WHERE id = $1',
      [id]
    );
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL || 'http://localhost:3001'}/api/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user exists with this provider
          let result = await pool.query(
            'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
            ['google', profile.id]
          );

          let user;
          if (result.rows.length === 0) {
            // Check if email is already used by another provider
            const email = profile.emails?.[0]?.value || `${profile.id}@google.oauth`;
            const emailCheck = await pool.query(
              'SELECT oauth_provider FROM users WHERE email = $1',
              [email]
            );

            if (emailCheck.rows.length > 0) {
              const existingProvider = emailCheck.rows[0].oauth_provider;
              if (existingProvider) {
                const providerName = existingProvider.charAt(0).toUpperCase() + existingProvider.slice(1);
                return done(new Error(`This email is already registered with ${providerName}. Please sign in with ${providerName} instead.`), undefined);
              } else {
                return done(new Error(`This email is already registered with email/password. Please sign in with your email instead.`), undefined);
              }
            }

            // Create new user
            const name = profile.displayName;
            const avatar = profile.photos?.[0]?.value;

            result = await pool.query(
              `INSERT INTO users (email, name, avatar, oauth_provider, oauth_id) 
               VALUES ($1, $2, $3, $4, $5) 
               RETURNING *`,
              [email, name, avatar, 'google', profile.id]
            );
            user = result.rows[0];
          } else {
            // Update existing user
            user = result.rows[0];
          }

          done(null, user);
        } catch (error) {
          done(error as Error, undefined);
        }
      }
    )
  );
}

// Microsoft OAuth Strategy
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(
    new AzureAdOAuth2Strategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL || 'http://localhost:3001'}/api/auth/microsoft/callback`,
        tenant: 'common', // Allows personal and work/school accounts
      },
      async (accessToken: string, refreshToken: string, params: any, profile: any, done: any) => {
        try {
          // Decode the ID token to get user info
          const idToken = params.id_token;
          const decodedToken: any = jwt.decode(idToken);
          
          if (!decodedToken) {
            return done(new Error('Failed to decode ID token'), undefined);
          }

          const microsoftId = decodedToken.oid || decodedToken.sub;
          const email = decodedToken.email || decodedToken.preferred_username;
          const name = decodedToken.name || email;

          let result = await pool.query(
            'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
            ['microsoft', microsoftId]
          );

          let user;
          if (result.rows.length === 0) {
            // Check if email is already used by another provider
            const emailCheck = await pool.query(
              'SELECT oauth_provider FROM users WHERE email = $1',
              [email]
            );

            if (emailCheck.rows.length > 0) {
              const existingProvider = emailCheck.rows[0].oauth_provider;
              if (existingProvider) {
                const providerName = existingProvider.charAt(0).toUpperCase() + existingProvider.slice(1);
                return done(new Error(`This email is already registered with ${providerName}. Please sign in with ${providerName} instead.`), undefined);
              } else {
                return done(new Error(`This email is already registered with email/password. Please sign in with your email instead.`), undefined);
              }
            }

            result = await pool.query(
              `INSERT INTO users (email, name, oauth_provider, oauth_id) 
               VALUES ($1, $2, $3, $4) 
               RETURNING *`,
              [email, name, 'microsoft', microsoftId]
            );
            user = result.rows[0];
          } else {
            user = result.rows[0];
          }

          done(null, user);
        } catch (error) {
          done(error as Error, undefined);
        }
      }
    )
  );
}

export default passport;
