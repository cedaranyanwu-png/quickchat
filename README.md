# Getting Started with Create React App

## QuickChat API and sign-in

The API is in `server/`. It provides email/password registration and login, verifies Google ID tokens, and stores accounts through `server/database.js`.

1. In `server/`, copy `.env.example` to `.env` and set a private `JWT_SECRET` and your Google OAuth web client ID. The server reads this file directly.
2. Keep `DB_TYPE=sqlite` for local development. The existing SQLite database is upgraded in place at startup, preserving accounts and copying their old name and Google ID fields.
3. From the project root, run `npm run dev` to start the API at `http://localhost:5000` and the React frontend at `http://localhost:5001` together. The frontend proxies `/api` requests to the API. Open `http://localhost:5001` during development. For a production-style local run, `npm start` builds React and serves the frontend and API together at `http://localhost:5000`.
4. In Google Cloud Console, add `http://localhost:5001` and `http://localhost:5000` as Authorized JavaScript origins for the same web client ID used in `server/.env`.

To use PostgreSQL, set `DB_TYPE=postgres` in `server/.env` and provide `DATABASE_URL`, or the `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, and `PG_DATABASE` settings. `DB_TYPE=postgresql` is accepted as an alias. Set `PG_SSL=true` when the database provider requires TLS. The existing MySQL adapter remains available with `DB_TYPE=mysql` and the `MYSQL_*` settings.

`GET /api/health` reports API/database status. `GET /api/config` only exposes the public Google OAuth client ID needed by the browser; secrets remain on the server.

The `.env` files and SQLite database are ignored by Git. Keep real credentials in your local `server/.env`, not in source files.

### Page API map

Every page API below expects `Authorization: Bearer <token>` from login or registration.

| Frontend page or feature | Backend endpoints |
| --- | --- |
| Home and create post | `GET /api/home`, `POST /api/posts`, `POST/DELETE /api/posts/:id/likes`, `POST /api/posts/:id/reposts`, `GET/POST /api/posts/:id/replies`, `POST /api/media`, `DELETE /api/media/:filename` |
| Explore and sidebar discovery | `GET /api/explore?q=...`, `GET /api/discover` |
| Profile, viewed profile, edit profile | `GET/PATCH /api/profile/me`, `GET /api/profile/me/posts`, `GET /api/profiles/:username` |
| Follow suggestions and actions | `GET /api/users?q=...`, `POST/DELETE /api/users/:id/follow` |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/read` |
| Messages | `GET/POST /api/messages/conversations`, `GET/POST /api/messages/conversations/:id/messages` |
| Videos and video detail | `GET/POST /api/videos`, `GET /api/videos/:id`, `POST /api/videos/:id/views`, `GET/POST /api/videos/:id/comments`, `POST /api/media` |
| Books / saved posts | `GET /api/books` or `GET /api/bookmarks`, `POST/DELETE /api/posts/:id/bookmark` |
| Communities | `GET/POST /api/communities`, `POST/DELETE /api/communities/:id/join` |
| Lists | `GET/POST /api/lists`, `GET/DELETE /api/lists/:id`, `POST /api/lists/:id/members`, `DELETE /api/lists/:id/members/:userId` |
| NovaAI | `GET /api/nova/conversations`, `GET/POST /api/nova/messages` |

The APIs and their table creation are in `server/routes/` and `server/schema.js`; they all use the shared adapter in `server/database.js`. `POST /api/media` accepts one raw image or video file in the request body (set `Content-Type` to the file's MIME type) and returns a URL that can be saved in a post or video. Uploads are limited to 15 MB for images and 100 MB for videos. NovaAI stores conversation history and calls the provider URL set in `NOVA_AI_ENDPOINT`; without a configured provider it returns a clear `503` response instead of pretending to generate an answer.

### Accounts, verification, and password recovery

- New email/password accounts receive a verification link and **cannot sign in until it is verified**. Verification links expire after 24 hours. Existing accounts are grandfathered as verified when the new columns are first added.
- `POST /api/auth/resend-verification` sends a fresh verification link; `GET /api/config` exposes the public Google client ID so the Google button also appears when running on localhost.
- `POST /api/auth/forgot-password` always returns a neutral response and sends a reset link only if the account exists. Reset links expire after 60 minutes and `POST /api/auth/reset-password` also marks the email verified.
- Configure email delivery in `server/.env` with `RESEND_API_KEY`, `SENDGRID_API_KEY`, or SMTP. For a custom domain mailbox set `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. For Gmail/Google Workspace use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, your Gmail address as `SMTP_USER`, and a 16-character **Google App Password** as `SMTP_PASS` (a normal Gmail password will not work). `SMTP_URL` also accepts a full connection URL. Test it with `npm --prefix server run email:test -- you@example.com`. Without a provider, the server logs the email and the development UI shows a preview link; production needs a provider.
- Set `GOOGLE_CLIENT_ID` (or `REACT_APP_GOOGLE_CLIENT_ID`) in `server/.env` and authorize the app origins in Google Cloud Console. Google-verified emails are treated as verified.

### Email on Railway

The server sends verification and password-reset emails through the first provider it finds, in this order: `RESEND_API_KEY`, `SENDGRID_API_KEY`, then SMTP (`SMTP_HOST` or `SMTP_URL`). Without one, emails are only logged and nobody can verify an account.

Use Resend on Railway. It sends over HTTPS, so it works on every plan. Outbound SMTP is blocked on Railway's Free and Hobby plans, so SMTP only works on Pro.

1. Create an API key at [resend.com](https://resend.com/api-keys).
2. To email real users, add and verify your sending domain in Resend (add the DNS records it shows). Until then, Resend only delivers to the email address of your own Resend account, from `onboarding@resend.dev`.
3. In the Railway service **Variables** tab, set:
   - `RESEND_API_KEY` = the key from step 1
   - `EMAIL_FROM` = `QuickChat <no-reply@yourdomain.com>` (an address on your verified domain)
   - `PUBLIC_APP_URL` = your app's public URL, used to build the verification and reset links
4. Railway redeploys on save. Register a new account and check that the verification email arrives. Failures appear in the deploy logs as `Resend rejected the email (...)`.

SMTP alternative (Railway Pro only): set `SMTP_HOST`, `SMTP_PORT` (`587`, or `465` with `SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. For Gmail, `SMTP_PASS` must be a Google App Password.

### NovaAI assistant

- NovaAI works without extra configuration when Ollama is running locally. It uses `NOVA_AI_OLLAMA_URL` (default `http://localhost:11434/api/chat`). Set `NOVA_AI_MODEL_PATH` to the Ollama models directory (for example `C:\Users\you\.ollama\models`) and NovaAI discovers the installed model name from the manifests. Set `NOVA_AI_MODEL` explicitly to skip discovery; otherwise it falls back to `llama3.2`.
- For a hosted provider, set `NOVA_AI_ENDPOINT` and optionally `NOVA_AI_API_KEY`; the endpoint receives `{ messages, userId }`.
- The server builds an assistant prompt from the signed-in user's profile, interests, recent posts, and communities. It also loads the latest conversation history.
- The NovaAI page now has a welcome assistant view, suggested prompts, conversation history, a new-chat action, copy buttons, typing feedback, and a provider status badge.
- `GET /api/nova/status` reports whether the local model is reachable. Conversation history uses the existing `nova_conversations` and `nova_messages` tables.

The bot runtime starts with both `npm run dev` and `npm start`; run it alone with `npm --prefix server run ai-poster:start` when needed. Its posting roster is [server/models/data/characters.json](server/models/data/characters.json), with one AI-labeled account per character. Configure `AI_POSTER_FEEDS` in `server/.env` as a comma-separated list of feed URLs. Stories are checked against character interests before Ollama rewrites them, staged in `autonomous_posts`, and published under the matching character account to Home and Explore. Development staging uses `server/test_database.sqlite`; production staging uses PostgreSQL through `DATABASE_URL`. `AI_POSTER_MODEL`, `AI_POSTER_MODEL_URL`, `AI_POSTER_SCHEDULE`, and `AI_POSTER_MAX_ITEMS_PER_FEED` can override the model, endpoint, schedule, and per-feed item limit.

While the runtime is up, the characters also act like social users: they follow new people, follow back anyone who follows them, like and comment on recent human posts (weighted by post length, media, hashtags, and category), and answer direct messages. A fast social pass runs every 20 seconds, and direct-message replies are checked every 10 seconds. In the current roster each account can like a post once, so the maximum likes per post is the number of character accounts (16); raise the roster in `characters.json` if you need higher counts. The follow, like, comment, and reply limits are documented in `server/.env.example` under `AI_POSTER_SOCIAL_*`.

### Feeds and discovery

- **Home** is interest-only. It shows accessible posts whose category, text, hashtags, or target interests match the interests on the signed-in profile; an account with no interests starts empty instead of seeing a generic feed.
- **Explore** is the broader algorithm feed. It includes every accessible post, ranked by interest match and freshness, including posts outside the reader's selected interests.
- Both feeds include posts from free communities and from paid communities the reader belongs to. Each feed response also returns `suggestedUsers` and `suggestedCommunities`, shown as “People to follow” and “Communities to join”.
- The discovery strip appears after the third post instead of occupying the top of the feed. Short feeds show it after the last post.
- After a post is one minute old, `PostCard` hides the community/category chips, hashtags, and source link so older cards stay clean. Fresh posts keep them briefly for context.
- Older posts show a deterministic historical reaction baseline (roughly 10–70 reactions in the first day, 300–1,200 in the first week, and 1,200–5,000 after that). It is added to the API's like/reply counts on top of recorded interactions. Set `AI_POSTER_LEGACY_ENGAGEMENT=false` in `server/.env` to show only recorded reactions.

### Composer and live

- The Home composer row uses an icon button that opens the post modal. The old “Advanced composer” text link is gone.
- The sidebar account menu includes **Advanced post composer**, and the post modal has an icon that opens the advanced composer with the draft text and any selected files carried over through router state.
- The post modal includes **Go live**. It opens the camera/microphone, shows a local live preview with a timer, records while the session is active, and publishes the recording as a video post when the session ends. This is a client-side live capture flow; multi-viewer real-time streaming would need a separate media server.

---

## Create React App reference

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Builds React and runs the combined app, API, and bot runtime on [http://localhost:5000](http://localhost:5000).

### `npm run dev`

Starts the API with file watching on port `5000` and the React development server on port `5001`. Use `npm run dev:frontend` to run only the frontend, or `npm --prefix server run dev` to run only the API.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
