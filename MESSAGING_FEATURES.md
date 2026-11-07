# QuickChat messaging: media and calls

## Included messaging features

- Send JPEG, PNG, GIF and WebP images in a direct conversation.
- Record and send voice notes using the browser microphone.
- Record and send short video messages using the camera and microphone.
- The composer displays a red recording indicator while audio or video capture is active. Press the stop control to finish and upload the recording.
- Play voice notes and videos inline in the conversation; images display in the message bubble.
- Start one-to-one voice or video calls from the conversation header.
- Incoming calls display an in-app modal with **Answer** and **Reject** controls. Active calls provide mute, camera toggle (video calls) and end-call controls.

## Browser and hosting requirements

- Serve the frontend and API over HTTPS. Browsers restrict microphone and camera access to secure contexts (localhost is allowed for local development).
- Users must grant microphone permission for voice notes and voice calls, and camera permission for video recordings and video calls.
- WebRTC uses the configured STUN servers by default. For dependable calls across mobile networks, carrier NATs and restrictive firewalls, configure a TURN relay on the API service:
  - `WEBRTC_TURN_URL`
  - `WEBRTC_TURN_USERNAME`
  - `WEBRTC_TURN_CREDENTIAL`
- The existing `WEBRTC_STUN_URLS` setting remains supported.
- TURN credentials should be time-limited where your TURN provider supports ephemeral credentials. Do not expose a permanent TURN secret in frontend code.

## Upload limits

- Images: 15 MB
- Audio notes: 30 MB
- Video attachments: 500 MB

The server validates supported MIME types and basic file signatures before storing uploads. The message API only attaches media uploads owned by the authenticated sender.

## Call transport

Calls use browser WebRTC for audio/video transport. The API persists call invitations and signaling messages in the database, so signaling does not depend on in-memory state in a single Railway process. Actual media flows peer-to-peer when network conditions permit, or through the configured TURN relay when required.

The incoming-call modal is shown while the recipient has the QuickChat Messages page open. Push notifications for incoming calls when the app is closed or the user is browsing another page are not part of this implementation.
