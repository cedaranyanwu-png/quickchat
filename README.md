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
| Discover and RSS articles | `GET /api/rss/articles`, `POST /api/rss/articles/:id/interactions`, `POST/DELETE /api/rss/articles/:id/save`, `GET /api/rss/saved-articles`, `POST /api/rss/articles/:id/discuss` |
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

Running without email: set `EMAIL_VERIFICATION=off` on the server. New accounts are then marked verified and signed in immediately, and existing unverified accounts can sign in. Password-reset emails still need a provider. Remove the variable once a provider is configured.

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

### RSS aggregation and Discover

The dedicated Discover page is available at `/discover`. It combines QuickChat trending posts and creator suggestions with imported publisher articles. RSS articles are labeled as external publisher content and link readers to the original publisher. Users can save, share, and start one discussion post per article per user.

RSS ingestion runs separately from the API and does not fetch feeds when a user opens Home or Discover. Start the worker with:

```bash
npm --prefix server run rss-worker:start
```

The default schedule is every 15 minutes. The worker uses the existing `rss-parser`, Axios and Cheerio dependencies, respects per-source sync intervals, stores ETag/Last-Modified validators, and records sync logs. It limits response size and request time, disables redirects, resolves feed hosts and rejects private/internal IP destinations before connecting. Imported descriptions are converted to plain-text excerpts; the complete external article is not republished.

Configure these values in `server/.env`:

- `RSS_ADMIN_USER_IDS`: comma-separated numeric user IDs permitted to manage RSS sources. This is an explicit allowlist because the current application does not expose a reusable administrator-role middleware.
- `RSS_SYNC_CRON`: worker schedule (default `*/15 * * * *`).
- `RSS_SYNC_ON_START`: run one synchronization cycle when the worker starts (default `true`).
- `RSS_REQUEST_TIMEOUT_MS`, `RSS_MAX_FEED_BYTES`, `RSS_MAX_ITEMS_PER_SYNC`: ingestion safety limits.

Authenticated RSS administration endpoints are `GET/POST /api/rss/admin/sources`, `PATCH/DELETE /api/rss/admin/sources/:sourceId`, `POST /api/rss/admin/sources/test`, `POST /api/rss/admin/sources/:sourceId/sync`, and `GET /api/rss/admin/logs`. New and changed feeds are fetched and parsed before they can be enabled. Add only publisher feed URLs that have been tested and whose feed terms permit the displayed metadata/excerpts. No candidate publishers are pre-enabled automatically.

The visual RSS source manager is available at `/admin/rss` for IDs listed in `RSS_ADMIN_USER_IDS`. It includes feed testing, enable/disable controls, manual synchronization and recent logs. A dedicated failed-feed filter, category-management UI, and publisher-specific terms/permissions review remain to be completed.

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
