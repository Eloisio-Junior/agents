# Google OAuth

Google Sign-In is wired via Google Identity Services (One Tap popup + official button) and disabled by default. When `GOOGLE_CLIENT_ID` is not set, the button is hidden and the backend `POST /api/auth/google` returns 404.

## Enable

1. Create an OAuth 2.0 Client ID (type **Web application**) at <https://console.cloud.google.com/apis/credentials>
2. Add your Authorized JavaScript origins (e.g. `http://localhost:3000` in dev, your production domain in prod). No redirect URI is needed; GIS does not use one.
3. Copy the client ID into `.env` as `GOOGLE_CLIENT_ID=...`. No client secret is required: the backend verifies the ID token against Google's JWKS.
4. Restart `bun dev`. The button and One Tap prompt appear on the login and signup pages.

On first sign-in, a new user is created with `password_hash: NULL` and `role: USER`. If a user already exists with the same email, the Google account is linked to that user (requires Google's `email_verified` to be `true`).

## Remove completely

- Delete `src/api/features/auth/google.service.ts`, `src/client/lib/google.ts`, `src/client/components/GoogleSignInButton.tsx`, `src/client/hooks/useGoogleSignIn.ts`
- If no other code uses it, delete `src/client/lib/types.ts` (it was introduced for `ApiErrorPayload` shared between Login/Signup)
- Remove the `POST /auth/google` route and the `providers` field in `GET /auth/me` from `src/api/features/auth/auth.controller.ts`
- Drop the Google-related helpers (`getUserByGoogleId`, `createGoogleUser`, `linkGoogleIdToUser`) from `src/api/features/auth/auth.service.ts`
- Revert the Prisma schema: restore `passwordHash` to non-nullable, drop the `googleId` field, drop the `users_auth_method_check` constraint, and write a new migration (`ALTER TABLE "users" DROP CONSTRAINT "users_auth_method_check"; ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL; ALTER TABLE "users" DROP COLUMN "google_id";`)
- Remove the Google button, `handleGoogleCredential`, and `useGoogleSignIn` import + usage from `LoginPage.tsx` and `SignupPage.tsx`, and the `providers` state from `AuthContext.tsx`
- Remove `GOOGLE_CLIENT_ID` from `.env.example`, `googleClientId`/`googleOAuthEnabled` from `src/config.ts`
- `bun remove jose`
- Remove `auth.or`, `auth.googleSignInFailed` from client locales and `errors.googleSignInFailed` from api locales
- Delete `tests/api/features/auth/google.service.test.ts`
