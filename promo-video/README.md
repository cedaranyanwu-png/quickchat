# QuickChat promo video

This folder contains a standalone, animated 75-second promotional presentation for the QuickChat social app. It is separate from the application and does not change the production site.

## Preview

Open `index.html` in a current desktop browser. Use Play, the scene list, the scrubber, or Full screen to preview the story. The video canvas is rendered at 1920 × 1080 and 30 fps regardless of its on-page preview size. The scene panel shows the synchronized voiceover line; **Read voiceover** and **Download transcript** expose the full script.

## Set the public QuickChat URL

The closing scene says “JOIN QUICKCHAT.” The URL is blank by default because the current configured domain points to a different product. Once the public QuickChat address is known, edit the `PUBLIC_URL` constant near the start of the script in `index.html`:

```js
const PUBLIC_URL = 'https://your-real-quickchat-domain.example';
```

The promo renders that URL on the closing frame and includes it in the generated transcript only if the value is nonempty. Do not use `nodexplatform.com.ng` unless it is actually reassigned to QuickChat.

## Record and make an MP4

1. Click **Record 1080p**. The presentation starts from the opening and records its 75-second canvas at 30 fps. The browser downloads `QuickChat-Promo-1080p.webm` when playback finishes.
2. If FFmpeg is installed, run this PowerShell script from this folder:

   ```powershell
   .\export-mp4.ps1 -InputFile .\QuickChat-Promo-1080p.webm
   ```

   It writes an H.264, 1920 × 1080 MP4 with fast-start metadata. The script checks for FFmpeg and reports a clear message if it is unavailable. Or run the equivalent command directly:

   ```powershell
   ffmpeg -i .\QuickChat-Promo-1080p.webm -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p" -r 30 -c:v libx264 -preset medium -crf 19 -movflags +faststart .\QuickChat-Promo-1080p.mp4
   ```

No MP4 is included until a browser recording and FFmpeg conversion have actually been run. This presentation does not bundle music or synthesized voice. Record the scene narration or use a voice actor, then add that audio and properly licensed music in an editor. Since the video canvas is silent, the browser recording remains silent too.

## Product accuracy

Home, Explore, and Communities scenes use authentic QuickChat browser captures from a clean temporary demo database. The accounts, names, posts, and community shown in those captures are fictional demo data. An unobtrusive “QuickChat interface · demo content” label appears on each capture.

The opening also uses illustrated sample posts and profile art to make the pitch more energetic. Every high engagement or follower count on those floating cards is explicitly marked as a demo placeholder; it is not a real QuickChat platform metric.

The direct-message and video screens are clearly labeled illustrative UI because no suitable message capture was available. The creator options scene is also an illustrative composition based on implemented product settings. The presentation makes no claim about configured payouts or guaranteed earnings.

Scene 4 starts on the Home capture and transitions to Explore around 5 seconds into its 12-second slot. Its single voiceover line bridges both screens. Scene 6 pairs the Communities capture with an illustrative video view; both stay visible during that 11-second slot.

## QuickChat pitch deck

`quickchat-platform-pitch.html` is a separate eight-slide, speaker-led pitch deck with a 78-second narration. It uses a dark navy and electric-blue visual system, with warmer community-poster accents and connection-map graphics. The existing animated promo above is unchanged.

Open the HTML file in a desktop browser. Navigate with the arrow keys, Space, Page Up/Down, mouse wheel, or swipe. **Notes** shows the current narration line. Press **E** to edit highlighted slide text; edits auto-save in this browser. Use **Save edits** or Ctrl+S to save locally, and **Download HTML** to export an edited copy.

The deck embeds its logo and authentic Home, Explore, and Communities screenshots. Sample names and engagement counts are labeled as demo content. The public QuickChat URL is not confirmed, so the closing slide has no domain. The voiceover is in `quickchat-pitch-voiceover.md`. Google Fonts are loaded online; the deck has local fallback fonts if unavailable.

The source skill is saved locally in `frontend-slides-skill/`, with style previews under the project’s `.frontend-slides/slide-previews/` folder.
