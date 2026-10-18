# Ticketino frontend

Persian RTL ticketing frontend built with Next.js App Router, React, TypeScript, and the local Vazirmatn font.

## Run

```powershell
npm install
npm run dev
```

Open http://localhost:3000/login or /signup. The API defaults to http://localhost:5080. To change it, copy `.env.example` to `.env.local`, set `AUTH_BACKEND_ORIGIN` to an origin without an API suffix, and restart Next.js. Set it before production builds too. Next rewrites `/api/v1/auth/*`, `/Tickets/v1/*`, and `/hubs/tickets/*` to that backend, including WebSocket upgrades.

To send browser requests directly to a separate API host, set `NEXT_PUBLIC_API_ORIGIN` (for example `https://api-ticketing.theteam-test.xyz`) before building. Authentication, password recovery, ticket requests, and SignalR then use that origin. Leave it empty for the same-origin proxy used in local development. The API must allow the frontend HTTPS origin through CORS; storage uses its own `NEXT_PUBLIC_CDN_ORIGIN`. Changing either public origin requires rebuilding the frontend.

## Authentication

Country choices load from `/Common/v1/Countries/List`. Login, signup and password recovery share a searchable country picker with actual local SVG flags in every option, dialing prefixes and keyboard selection. The list opens in a portal so it stays within the viewport without moving the form. Country IDs sent to the API remain unchanged; loading/failure and retry states do not substitute a fake Iran-only list.

The implementation follows `../ticketing/ViewModels/Identity/AuthViewModels.cs` and the identity service:

| Endpoint | Request / behavior |
| --- | --- |
| `GET /api/v1/auth/roles` | Loads `{ id, value, label }` options. Enum values `Client`/`Agent` are sent at registration; backend Persian labels appear in the dropdown. Loading/failure states and retry are available. |
| `POST /api/v1/auth/register` | Sends fullName, countryId, mobile, password, confirmPassword, role. Stores the returned session and opens the dashboard for the selected role immediately. |
| `POST /api/v1/auth/login` | Sends countryId, mobile and password. Consumes data.user, token, expiresAt, refreshToken, refreshTokenExpiresAt. |
| `GET /Common/v1/Countries/List` | Supplies countries, calling codes and flags for registration, login and password recovery. Iran (+98) is selected initially. |
| `POST /api/v1/auth/forgot-password/request` | Sends countryId/mobile to request an SMS verification code. |
| `POST /api/v1/auth/forgot-password/verify` | Sends countryId/mobile/code and receives a single-use resetToken. |
| `POST /api/v1/auth/forgot-password/reset` | Sends countryId/mobile/resetToken/password/confirmPassword to finish recovery. |
| `POST /api/v1/auth/refresh` | Sends `{ refreshToken }`; replaces both rotated tokens and their expirations. |

User identity, role and permissions come from the backend. Clients go to `/client/dashboard`; agents go to `/support/dashboard`. Registration uses a compact single form. Passwords are required and at most 128 characters, with matching confirmation. Names are 2–150 characters. Each international mobile number identifies one account. `/forgot-password` provides the three-step SMS recovery flow.

Unremembered sessions use sessionStorage; “مرا به خاطر بسپار” uses localStorage. Both store the access and refresh credentials plus returned user data, never the password. Blocked browser storage falls back to memory until reload. Expired legacy sessions without refresh credentials require another login.

Session restoration and protected requests refresh access tokens within 30 seconds of expiry. A protected 401 refreshes and retries that request exactly once. Concurrent requests share a refresh operation; Web Locks coordinate rotating persistent tokens across tabs where supported. Refresh preserves the selected storage type. Logout or a newer login prevents late refresh responses from restoring old state. Invalid/expired refresh credentials clear the session; temporary connection/server failures preserve it for retry. A 403 does not refresh or sign out. Focus, timer, and storage events keep session state current.

The backend exposes no `/me` or logout/revocation endpoint. Logout clears local credentials, including persistent credentials in other tabs, but cannot revoke issued tokens on the server. Backend signatures and permissions authorize all operations; frontend guards and stored user data provide navigation only. Serve production over HTTPS and protect the app from untrusted scripts because browser storage is accessible to JavaScript.

## Tickets

All ticket operations use `authenticatedFetch` for Bearer headers, refresh and one-time 401 recovery. Requests are uncached, constrained to validated ticket API paths on the configured origin, and use timeouts. Protected reads abort on unmount/filter changes, and late responses cannot overwrite newer results.

| Endpoint under `/Tickets/v1/Tickets` | Frontend behavior |
| --- | --- |
| `GET /Dashboard` | Real per-status counts in both dashboards |
| `GET /List` | Search/status/priority filters, server sorting and pagination; `mineOnly=true` for the assigned-to-me view |
| `GET /Unassigned` | Agent unassigned list |
| `POST /Create` | Client creation with title and description only; priority stays unset until acceptance |
| `GET /Select/{id}` | Ticket details, assignment and nullable priority; clients never see priority |
| `POST /{id}/Accept` | Agent explicitly accepts an open, unassigned request and selects enum priority |
| `GET /{id}/TransferAgents` | Search active destination agents by name or mobile, ten per page; display both to distinguish identical names |
| `POST /{id}/Transfer` | Assigned agent selects another agent; preserves chat and transfers responsibility immediately |
| `POST /{id}/Release` | Assigned agent returns an active request to the open queue without erasing its history |
| `GET /ReplyReminders` | Current agent's durable alerts for seen customer messages awaiting a reply |
| `POST /{id}/ReplyReminder/Dismiss` | Snooze the current notification for another five minutes, across tabs and reloads |
| `GET /{id}/Conversation` | Client conversation from submission; assigned agent joins after acceptance |
| `POST /{id}/Messages` | Sends body and a UUID clientMessageId; retries preserve the UUID to prevent duplicate messages |
| `POST /{id}/Read` | Durable monotonic read cursor; HTTP recovery when a hub acknowledgement is unavailable |
| `PATCH /{id}/Priority` | Assigned agent changes priority on a non-closed ticket |
| `PATCH /{id}/Status` | Assigned agent closes a conversation with `Closed`; all other statuses are automatic |

The agent sees the open queue and their own assigned requests. Accepted requests and conversations are inaccessible to other agents. Initial assignment requires acceptance; an assigned agent may subsequently transfer the active conversation or return it to the open queue. Replying never implicitly claims a request. Handoff controls appear in the assigned agent's chat, with confirmation and a searchable destination picker. SignalR updates the customer's agent and clears the former agent's chat in all tabs. The assigned view uses backend filtering and pagination. The removed department field is not sent in creation or list filters.

Lists accept `sortBy=UpdatedAt|Priority` and `sortOrder=Desc|Asc`, defaulting to newest update first. Priority sorting is agent-only, uses High/Medium/Low order, and keeps unset priorities last in either direction. Ties use update time and ID for stable server pagination. Choosing a sort option reloads immediately and returns to page one; clearing filters restores the default ordering. Clients can sort by update time without receiving or inferring internal priorities.

Creation requires both the client role and tickets.create permission. Agents never see creation links or the creation form. Acceptance, chat, priority and closing controls follow the returned permissions and ticket ownership. Clients can send multiple messages before the first acceptance; the conversation payload has no agent yet. These messages keep the request Open. Acceptance makes it InProgress (در جریان) and preserves all earlier messages. Each new agent message makes it Answered, and each new client message after acceptance makes it InProgress. Assignment persists across all subsequent messages; no new acceptance is needed. Status changes are committed with the message in the backend. Idempotent retries do not change the status again. There is no manual status selector; the assigned agent can close the request from inside the chat. Closed tickets remain readable without message/priority/closing actions and cannot be reopened. Backend conflicts reload current details; losing access removes previously displayed data. A message revision conflict retries once with the same UUID after verifying that the request remains open. Failed submissions preserve user input. Empty lists, loading, unavailable service, validation, denied/not-found, throttling and conflicts have Persian feedback and retry where appropriate.

## Live conversations

Only Open and InProgress requests in lists and dashboard recent requests show a subtle blue row tint and small dot for new incoming messages; Answered and Closed requests never show the marker, with a slightly stronger hover and unchanged text weight. The inbox marker uses each recipient's own last viewed incoming message, ordered by timestamp and ID. Seeing the latest incoming message clears the conversation marker even when older history is offscreen; an individual message's double check still requires that specific message to be seen. Another agent reading the queue cannot clear the assigned agent's marker. Own and deleted messages do not create notifications. Actual read events, new messages, deletions, reconnection and returning to a visible tab refresh the indicator.

The official `@microsoft/signalr` client maintains one authenticated `/hubs/tickets` connection per signed-in app instance. It shares access-token refresh with REST requests and reconnects automatically. `MessageReceived`, `TicketChanged`, `TicketDeleted`, queue updates, `MessagesRead`, and `TypingChanged` update active views immediately. Reconnection reloads the current snapshot to recover missed events. Healthy connections do not poll conversations; a visible page falls back to five-second refresh only while disconnected. Incoming events are applied immediately and replayed over any in-flight snapshot, preserving both missed history and newer messages.

The hub exposes `MarkRead(ticketId, { lastReadMessageId })` and `SetTyping(ticketId, isTyping)`. Read cursors are stored by participant and ticket in the backend, advance monotonically, and survive reloads. The frontend acknowledges incoming messages only when they intersect the conversation viewport and the document is visible and focused. Sent messages show one check; actual read receipts show two. Typing events are throttled, sent only to the other participant, and expire automatically. Run the backend migrations before deploying these features.

The conversation keeps its name, subject, priority/closing controls and composer fixed while only messages scroll. Priority changes save immediately; closing uses a compact confirmation. Image, video, file and recorded voice previews are local drafts only: uploading and sending attachments still require a future backend API. Draft attachments disable submission to avoid silently omitting selected media. Microphone tracks stop on completion/cancellation/unmount, and temporary object URLs are released.

## Validation

```powershell
npm test
npm run lint
npm run build
```

Node tests cover auth/role contracts, refresh rotation, concurrent 401 recovery, logout races, storage persistence, password policy, ticket routes/bodies, explicit acceptance, private conversation payloads, message UUID preservation and bounded conflict retry, server pagination/filtering, malformed responses and translated errors. Backend tests cover durable read cursors and participant access. Browser checks exercise real two-account WebSockets, read/typing events, message latency, local media/voice drafts and mobile layout.

Main files: `src/lib/auth.ts`, `src/lib/tickets.ts`, `src/lib/auth-validation.ts`, `src/components/auth/AuthProvider.tsx`, `SignupForm.tsx`, `src/components/tickets/TicketViews.tsx`, `TicketRealtime.tsx`, `TicketChatContainer.tsx`, `TicketChatWorkspace.tsx`, `ChatComposer.tsx`, `useChatReadCursor.ts`, `useTicketData.ts`, and `next.config.ts`.
